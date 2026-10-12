/**
 * Keeps one collection of a campaign (entries or relationships) in memory, reading as little as
 * possible. Two modes:
 *
 * full   — what the app always did: listen to the whole collection. Used on a device's first
 *          visit, at least every few days, after bulk changes, or whenever anything looks off.
 * delta  — the screen is built from the device's own offline copy (cache-only listeners, which
 *          cost nothing and also show this device's unsaved edits at once). Server listeners ask
 *          only for documents changed since the last visit; they pull those into the offline copy
 *          and say which cached documents can be trusted. Hints (lib/sync.ts) cover deletions and
 *          lost access. Any error or doubt falls back to `full`.
 *
 * A cached document is shown in delta mode only if it was visible at the end of the last visit
 * (`state.ids`), or the server has delivered it in this session, or it has an unsaved local edit;
 * and not if a hint dropped it or the server said it no longer matches that query.
 */
import {
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, cacheIsPersistent } from '../firebase';
import { FULL_EVERY_MS, hintsCollection, loadSyncState, MARGIN_MS, saveSyncState, SYNC_VERSION, syncMillis, type SyncColl, type SyncHint, type SyncState } from './sync';
import { logError } from './errors';

export interface SyncDoc {
  id: string;
  syncAt?: unknown;
}

export interface SyncOptions<T extends SyncDoc> {
  /** Storage key: one per campaign, user, role and collection. */
  key: string;
  campaignId: string;
  coll: SyncColl;
  uid: string;
  isDM: boolean;
  /** The full queries (the union is the collection as this user may see it). */
  queries: Query[];
  onData: (docs: T[]) => void;
  onError: (message: string) => void;
  /** Also drop documents that depend on another one deleted (e.g. links to a deleted entry). */
  dropsWith?: (deleted: { coll: SyncColl; docId: string }, d: T) => boolean;
}

export type SyncMode = 'full' | 'delta';

const DONE_HINTS = 300;
/** Server times beyond this are treated as nonsense (the rules make them the server's clock anyway). */
const FUTURE_LIMIT_MS = 365 * 24 * 3600_000;
const sane = (t: number | null): t is number => t !== null && t > 0 && t < Date.now() + FUTURE_LIMIT_MS;

export class CollectionSync<T extends SyncDoc> {
  mode: SyncMode = 'full';
  /** Why the last full load happened (for the console and tests). */
  reason = '';
  /** True once every query has had a server answer (state is then saved). */
  ready = false;
  /** What's on screen, per query (read by tests in development). */
  buckets: Map<string, T>[] = [];

  private gen = 0;
  private unsubs: Unsubscribe[] = [];
  private state: SyncState | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private serverSeen: boolean[] = [];

  // Delta mode bookkeeping.
  private cached: Map<string, { data: T; pending: boolean }>[] = [];
  private trusted = new Set<string>();
  private dropped = new Set<string>();
  private noLongerIn: Set<string>[] = [];
  private unhandled = new Map<string, SyncHint>();

  constructor(private o: SyncOptions<T>) {}

  start() {
    const st = loadSyncState(this.o.key);
    const why = this.deltaBlocker(st);
    if (why) this.startFull(st, why);
    else this.startDelta(st!);
  }

  stop() {
    this.flush();
    this.stopped = true;
    this.teardown();
  }

  /** Throw away what this device remembers and load everything again. */
  resync() {
    this.teardown();
    this.startFull(null, 'asked to reload');
  }

  /** Newest server time this device has seen (for tidying hints without trusting its clock). */
  serverTimeSeen(): number {
    if (!this.state) return 0;
    return Math.max(this.state.hintCursor, ...this.state.cursors);
  }

  // -------------------------------------------------------------------------

  private deltaBlocker(st: SyncState | null): string {
    if (!cacheIsPersistent) return 'no offline cache';
    if (!st) return 'first visit';
    if (st.v !== SYNC_VERSION) return 'new sync version';
    if (!Array.isArray(st.cursors) || st.cursors.length !== this.o.queries.length) return 'queries changed';
    if (Date.now() - st.fullAt > FULL_EVERY_MS || st.fullAt > Date.now() + 3600_000) return 'regular full load';
    if (st.noDeltaUntil && st.noDeltaUntil > Date.now()) return 'incremental sync paused after an error';
    return '';
  }

  private teardown() {
    this.gen++;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.ready = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private publish() {
    const merged = new Map<string, T>();
    for (const b of this.buckets) for (const [id, d] of b) merged.set(id, d);
    this.o.onData([...merged.values()]);
    if (this.ready && this.state) {
      this.state.ids = [...merged.keys()];
      this.scheduleSave();
    }
  }

  private scheduleSave() {
    if (this.saveTimer || this.stopped) return;
    this.saveTimer = setTimeout(() => this.flush(), 800);
  }

  private flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.ready && this.state && !this.stopped) saveSyncState(this.o.key, this.state);
  }

  /** Server delivered `docs` for query i: that query is complete up to their newest syncAt. */
  private advanceCursor(i: number, docs: { syncAt?: unknown }[]) {
    if (!this.state) return;
    let max = this.state.cursors[i] ?? 0;
    for (const d of docs) {
      const t = syncMillis(d.syncAt);
      if (sane(t) && t > max) max = t;
    }
    this.state.cursors[i] = max;
  }

  private markHintsDone(hints: SyncHint[]) {
    if (!this.state) return;
    const done = new Set(this.state.doneHints);
    for (const h of hints) {
      done.add(h.id);
      this.unhandled.delete(h.id);
      const t = syncMillis(h.at);
      if (sane(t) && t > this.state.hintCursor) this.state.hintCursor = t;
    }
    // Never move past a hint that still needs handling (e.g. an access check that failed offline).
    for (const h of this.unhandled.values()) {
      const t = syncMillis(h.at);
      if (sane(t) && t - 1 < this.state.hintCursor) this.state.hintCursor = t - 1;
    }
    this.state.doneHints = [...done].slice(-DONE_HINTS);
  }

  private listenHints(gen: number, act: boolean, fromMs: number) {
    const from = Timestamp.fromMillis(Math.max(0, fromMs - MARGIN_MS));
    const q = query(hintsCollection(), where('campaignId', '==', this.o.campaignId), where('at', '>', from));
    this.unsubs.push(
      onSnapshot(
        q,
        (snap) => {
          if (gen !== this.gen || !this.state) return;
          const fresh = snap
            .docChanges()
            .filter((c) => c.type === 'added')
            .map((c) => c.doc.data() as SyncHint)
            .filter((h) => !this.state!.doneHints.includes(h.id) && syncMillis(h.at) !== null);
          if (!fresh.length) return;
          if (act) void this.applyHints(gen, fresh);
          else {
            // Full mode: the listeners already show the effect; just remember these as handled.
            this.markHintsDone(fresh);
            this.scheduleSave();
          }
        },
        (err) => {
          if (gen !== this.gen) return;
          if (act) this.fallBack(err, 'hints');
          else logError('Sync hints', err);
        },
      ),
    );
  }

  private async applyHints(gen: number, hints: SyncHint[]) {
    const st = this.state!;
    const mine = hints.filter((h) => h.coll === this.o.coll);
    if (mine.some((h) => h.kind === 'resync')) {
      // Remember the hint (so the full load it causes doesn't trigger another), and that a full
      // load is owed (so closing the app halfway through can't skip it).
      this.markHintsDone(hints);
      st.fullAt = 0;
      saveSyncState(this.o.key, st);
      this.teardown();
      this.startFull(st, 'bulk change elsewhere');
      return;
    }
    const handled: SyncHint[] = hints.filter((h) => h.coll !== this.o.coll);
    const dropsWith = this.o.dropsWith;
    if (dropsWith) {
      for (const h of hints) {
        if (h.kind !== 'deleted' || h.coll === this.o.coll) continue;
        for (const b of this.cached) for (const [id, d] of b) if (dropsWith(h, d.data)) this.dropped.add(id);
      }
    }
    for (const h of mine) {
      if (h.kind === 'deleted') {
        this.dropped.add(h.docId);
        handled.push(h);
      } else if (h.kind === 'access') {
        const shown = this.buckets.some((b) => b.has(h.docId));
        if (!this.o.isDM && shown) {
          // Ask the server whether this one entry is still ours to read.
          try {
            const snap = await getDocFromServer(doc(db, this.o.coll, h.docId));
            if (gen !== this.gen) return;
            if (!snap.exists()) this.dropped.add(h.docId);
          } catch (err) {
            if (gen !== this.gen) return;
            if ((err as { code?: string })?.code === 'permission-denied') this.dropped.add(h.docId);
            else {
              // Offline or a hiccup: keep it for a retry (and keep the hint cursor before it).
              this.unhandled.set(h.id, h);
              continue;
            }
          }
        }
        handled.push(h);
      } else handled.push(h);
    }
    if (gen !== this.gen) return;
    this.markHintsDone(handled);
    this.rebuild();
    if (this.unhandled.size && !this.retryTimer) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (gen === this.gen && this.unhandled.size) void this.applyHints(gen, [...this.unhandled.values()]);
      }, 60_000);
    }
  }

  private fallBack(err: unknown, where_: string) {
    const code = (err as { code?: string })?.code ?? '';
    logError(`Incremental sync (${where_}) – loading everything instead`, err);
    const st = this.state;
    if (st) {
      // A missing index won't fix itself today; other errors are worth another try sooner.
      st.noDeltaUntil = Date.now() + (code === 'failed-precondition' ? 24 * 3600_000 : 3600_000);
      st.fullAt = 0; // whatever happens next, the next visit loads in full
      saveSyncState(this.o.key, st);
    }
    this.teardown();
    this.startFull(st, `error: ${code || 'unknown'}`);
  }

  // -------------------------------------------------------------------------

  private startFull(prev: SyncState | null, reason: string) {
    if (this.stopped) return;
    this.mode = 'full';
    this.reason = reason;
    const gen = ++this.gen;
    const n = this.o.queries.length;
    this.buckets = Array.from({ length: n }, () => new Map());
    this.serverSeen = Array(n).fill(false);
    this.unhandled.clear();
    const failed = Array(n).fill(false);
    const delivered = Array(n).fill(false);
    this.ready = false;
    this.state = {
      v: SYNC_VERSION,
      cursors: Array(n).fill(0),
      hintCursor: prev?.hintCursor ?? 0,
      doneHints: prev?.doneHints ?? [],
      fullAt: 0,
      ids: [],
      noDeltaUntil: prev?.noDeltaUntil,
    };
    this.o.queries.forEach((q, i) => {
      this.unsubs.push(
        onSnapshot(
          q,
          { includeMetadataChanges: true },
          (snap: QuerySnapshot) => {
            if (gen !== this.gen) return;
            const becameServer = !snap.metadata.fromCache && !this.serverSeen[i];
            // Metadata-only updates (a write confirmed, say) change nothing on screen.
            if (delivered[i] && !becameServer && !snap.docChanges().length) return;
            this.buckets[i] = new Map(snap.docs.map((d) => [d.id, d.data() as T]));
            delivered[i] = true;
            if (!snap.metadata.fromCache) {
              this.serverSeen[i] = true;
              this.advanceCursor(i, snap.docs.map((d) => d.data()));
            }
            if (!delivered.every(Boolean)) return;
            if (!this.ready && this.serverSeen.every(Boolean) && !failed.some(Boolean)) {
              this.ready = true;
              this.state!.fullAt = Date.now();
              // Hints older than what we just loaded are already reflected in it.
              this.state!.hintCursor = Math.max(this.state!.hintCursor, ...this.state!.cursors);
            }
            this.publish();
          },
          (err) => {
            if (gen !== this.gen) return;
            logError(`${this.o.coll} listener`, err);
            failed[i] = true;
            delivered[i] = true;
            this.o.onError('Some entries could not be loaded. Check your connection.');
            if (delivered.every(Boolean)) this.publish();
          },
        ),
      );
    });
    // A device new to this campaign doesn't need a week of old hints: only recent ones.
    this.listenHints(gen, false, prev ? prev.hintCursor : Date.now() - 3600_000);
  }

  private startDelta(st: SyncState) {
    this.mode = 'delta';
    this.reason = '';
    const gen = ++this.gen;
    const n = this.o.queries.length;
    this.state = { ...st, doneHints: st.doneHints ?? [], cursors: [...st.cursors] };
    this.trusted = new Set(st.ids);
    this.dropped = new Set();
    this.unhandled.clear();
    this.cached = Array.from({ length: n }, () => new Map());
    this.noLongerIn = Array.from({ length: n }, () => new Set());
    this.buckets = Array.from({ length: n }, () => new Map());
    this.serverSeen = Array(n).fill(false);
    this.ready = false;
    const cacheDelivered = Array(n).fill(false);
    let checked = false;

    // 1. The offline copy, as a live view (free: the cache only). Also shows unsaved local edits.
    this.o.queries.forEach((q, i) => {
      this.unsubs.push(
        onSnapshot(
          q,
          { source: 'cache', includeMetadataChanges: true },
          (snap: QuerySnapshot) => {
            if (gen !== this.gen) return;
            this.cached[i] = new Map(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => [d.id, { data: d.data() as T, pending: d.metadata.hasPendingWrites }]));
            cacheDelivered[i] = true;
            if (!cacheDelivered.every(Boolean)) return;
            if (!checked) {
              checked = true;
              // Everything that was on screen last time must still be in the offline copy.
              const have = new Set<string>();
              this.cached.forEach((b) => b.forEach((_, id) => have.add(id)));
              const missing = st.ids.filter((id) => !have.has(id)).length;
              if (missing) {
                this.teardown();
                this.startFull(st, `offline copy incomplete (${missing} missing)`);
                return;
              }
            }
            this.rebuild();
          },
          (err) => {
            if (gen !== this.gen) return;
            this.fallBack(err, 'offline copy');
          },
        ),
      );
    });

    // 2. Only what changed since (a little overlap is harmless: it's the same data again).
    this.o.queries.forEach((q, i) => {
      const since = Timestamp.fromMillis(Math.max(0, st.cursors[i] - MARGIN_MS));
      this.unsubs.push(
        onSnapshot(
          query(q, where('syncAt', '>', since)),
          { includeMetadataChanges: true },
          (snap: QuerySnapshot) => {
            if (gen !== this.gen) return;
            // Answers from the offline copy prove nothing; only the server's count.
            if (snap.metadata.fromCache) return;
            for (const d of snap.docs) {
              this.trusted.add(d.id);
              this.dropped.delete(d.id);
              this.noLongerIn[i].delete(d.id);
            }
            for (const c of snap.docChanges()) if (c.type === 'removed') this.noLongerIn[i].add(c.doc.id);
            this.serverSeen[i] = true;
            this.advanceCursor(i, snap.docs.map((d) => d.data()));
            if (!this.ready && this.serverSeen.every(Boolean)) this.ready = true;
            this.rebuild();
          },
          (err) => {
            if (gen !== this.gen) return;
            this.fallBack(err, this.o.coll);
          },
        ),
      );
    });

    // 3. Deletions and lost access.
    this.listenHints(gen, true, st.hintCursor);
  }

  /** Delta mode: what to show, from the offline copy and what the server has confirmed. */
  private rebuild() {
    if (this.mode !== 'delta' || this.cached.length !== this.o.queries.length) return;
    this.buckets = this.cached.map((b, i) => {
      const out = new Map<string, T>();
      for (const [id, d] of b) {
        if (d.pending) this.trusted.add(id); // this device's own edit or new entry
        if (this.dropped.has(id) || this.noLongerIn[i].has(id) || !this.trusted.has(id)) continue;
        out.set(id, d.data);
      }
      return out;
    });
    this.publish();
  }
}
