/**
 * The Scavenger's Codex inside DnDocs. The codex stays its own site (one copy of the code, also
 * usable on its own); DnDocs shows it in a frame and saves its state to the campaign, so the whole
 * party shares one satchel, clock, workbench and garden, and every player has their own satchel.
 *
 *   Codex  → DnDocs  { type: 'codex:ready' }                     loaded, waiting for hello
 *   DnDocs → Codex   { type: 'dndocs:hello', role, name, campaign, keys, open?, members, embed, home }
 *   DnDocs → Codex   { type: 'dndocs:members', members: [{ uid, name, role, items?, cp? }] }   (the DM also gets each satchel)
 *   DnDocs → Codex   { type: 'dndocs:state', keys }               someone else changed something
 *   Codex  → DnDocs  { type: 'codex:save', changes: [{ key, prev, next }] }
 *   DnDocs → Codex   { type: 'dndocs:saved', ok, error? }         only when saving failed
 *   DnDocs → Codex   { type: 'dndocs:open', open: { hash } | { fight: [{ id, n }] } }
 *   Codex  → DnDocs  { type: 'codex:entry', action: 'record', thing }   DM: make a DnDocs item
 *   Codex  → DnDocs  { type: 'codex:entry', action: 'handout', handout }   DM: post a handout note
 *   Codex  → DnDocs  { type: 'codex:error', stage: 'load' }      its data didn't load
 *   Codex  → DnDocs  { type: 'codex:give', gift: { id, to, items, cp } }   left in their inbox
 *   DnDocs → Codex   { type: 'dndocs:give', id, ok, error? }     (the codex gives it back if not ok)
 *   Codex  → DnDocs  { type: 'codex:bank', move: { id, uid, items, cp } }   DM: give to / take from a player
 *   DnDocs → Codex   { type: 'dndocs:bank', id, ok, error? }
 *
 * The frame is sandboxed without allow-same-origin, so the codex can't read DnDocs' sign-in even
 * though both live on justushellman.github.io. Messages are only accepted from that frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { logError } from '../lib/errors';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { Modal } from '../components/ui/Modal';
import { applySharingUpdate, quickCreateEntity } from '../lib/entityService';
import { CODEX_URL, codexFrameUrl } from '../lib/codex/catalog';
import {
  applyPartyOps,
  applySatchelOps,
  cleanGift,
  cleanBankMove,
  packsCol,
  sendGift,
  partyRef,
  satchelRef,
  savePacks,
} from '../lib/codex/service';
import {
  codexKeys,
  type CodexParty,
  KEY_HOMEBREW,
  KEY_PARTY,
  type PackDoc,
  packChanges,
  type PartyDoc,
  partyOps,
  pruneLogOps,
  pruneZeroOps,
  satchelOps,
  type SatchelDoc,
} from '../lib/codex/state';

const positiveItems = (m?: Record<string, number>) => Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => Number(v) > 0));

const CODEX_ORIGIN = new URL(CODEX_URL, location.href).origin;
/** At most this many codex saves in SAVE_WINDOW_MS before DnDocs stops saving (see codex:save). */
const MAX_SAVES_PER_WINDOW = 60;
const SAVE_WINDOW_MS = 30_000;
const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';

export interface CodexOpen {
  hash?: string;
  fight?: { id: string; n: number }[];
}

interface RecordThing {
  id: string;
  kind: 'material' | 'item';
  name: string;
  tier?: string;
  cat?: string | null;
  attune?: boolean | string;
  value?: number | null;
  desc?: string;
}

export default function CodexPage() {
  const { user, isDM, currentCampaign } = useAuth();
  const toast = useToast();
  const [satchels, setSatchels] = useState<Record<string, SatchelDoc>>({});
  const { members: campaignMembers, entities, canView } = useCampaignData();
  const location = useLocation();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [sandboxed, setSandboxed] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'stuck'>('loading');
  const [record, setRecord] = useState<RecordThing | null>(null);
  const [handout, setHandout] = useState<HandoutDraft | null>(null);

  // Where to start: a codex page (?open=#/monster/dire-wolf) or a battle's fallen (router state).
  const open = useMemo<CodexOpen | null>(() => {
    const st = location.state as { codexOpen?: CodexOpen } | null;
    if (st?.codexOpen) return st.codexOpen;
    const h = new URLSearchParams(location.search).get('open');
    return h && h.startsWith('#/') ? { hash: h } : null;
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const campaignId = currentCampaign?.id;
  const uid = user?.uid;

  // DM: every player's satchel and purse, so the codex can hand things out and take them back.
  useEffect(() => {
    if (!campaignId || !isDM) return setSatchels({});
    return onSnapshot(
      collection(db, 'codex', campaignId, 'satchels'),
      (snap) => setSatchels(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as SatchelDoc]))),
      () => undefined,
    );
  }, [campaignId, isDM]);

  // Everyone else in the campaign, named by their characters (to give things to).
  const members = useMemo(() => {
    if (!uid || !currentCampaign) return [];
    const dms = new Set([currentCampaign.dmId, ...(currentCampaign.coDms ?? [])]);
    return campaignMembers
      .filter((m) => m.uid !== uid)
      .map((m) => {
        const chars = entities.filter((e) => e.type === 'character' && e.playerId === m.uid && canView(e)).map((e) => e.name);
        const sat = isDM ? satchels[m.uid] : undefined;
        return {
          uid: m.uid,
          name: chars.length ? `${chars.join(', ')} (${m.displayName})` : m.displayName,
          role: dms.has(m.uid) ? 'dm' : 'player',
          ...(isDM ? { items: positiveItems(sat?.items), cp: Math.max(0, Math.floor(Number(sat?.cp) || 0)) } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [campaignMembers, entities, canView, uid, isDM, satchels, currentCampaign]);
  const membersRef = useRef(members);
  membersRef.current = members;

  // Live state and what the codex has been told, kept in refs (the message handler outlives renders).
  const s = useRef({
    party: null as PartyDoc | null,
    satchel: null as SatchelDoc | null,
    packs: [] as PackDoc[],
    loaded: { party: false, satchel: false, packs: false },
    pending: false,
    helloSent: false,
    wantsHello: false,
    sent: {} as Record<string, string>,
    open: null as CodexOpen | null,
    /** When recent saves were written (a safety stop against save loops, see codex:save). */
    saves: [] as number[],
    halted: false,
  });
  s.current.open = open;

  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, sandboxed ? '*' : CODEX_ORIGIN);

  const allLoaded = () => s.current.loaded.party && s.current.loaded.satchel && s.current.loaded.packs;
  const keysNow = () => codexKeys(s.current.party, s.current.satchel, s.current.packs);

  const sendHello = () => {
    if (!allLoaded() || !currentCampaign || !user) return;
    const keys = keysNow();
    s.current.sent = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, JSON.stringify(v)]));
    post({ type: 'dndocs:hello', role: isDM ? 'dm' : 'player', name: user.displayName, campaign: { id: currentCampaign.id, name: currentCampaign.name }, keys, open: s.current.open, members: membersRef.current, embed: true, home: window.location.origin + window.location.pathname });
    s.current.helloSent = true;
    s.current.wantsHello = false;
    setStatus('ready');
    // An unlock code was in the address (a handout link): it's used now, so don't keep it there.
    if (s.current.open?.hash?.startsWith('#/journal/')) navigate('/codex', { replace: true });
  };

  // Tell the codex what changed (never while our own writes are still on their way).
  const pushState = () => {
    if (!s.current.helloSent || s.current.pending || !allLoaded()) return;
    const keys = keysNow();
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(keys)) {
      const j = JSON.stringify(v);
      if (s.current.sent[k] !== j) {
        changed[k] = v;
        s.current.sent[k] = j;
      }
    }
    if (Object.keys(changed).length) post({ type: 'dndocs:state', keys: changed });
  };

  // Firestore: the party, my satchel, the campaign's homebrew.
  useEffect(() => {
    if (!campaignId || !uid) return;
    const st = s.current;
    st.loaded = { party: false, satchel: false, packs: false };
    st.helloSent = false;
    let tidied = false;
    const after = () => (st.wantsHello ? sendHello() : pushState());
    const u1 = onSnapshot(
      partyRef(campaignId),
      { includeMetadataChanges: true },
      (snap) => {
        st.party = snap.exists() ? (snap.data() as PartyDoc) : null;
        st.pending = snap.metadata.hasPendingWrites;
        st.loaded.party = true;
        // The DM's device keeps the party document tidy now and then.
        if (isDM && !tidied && st.party && !snap.metadata.hasPendingWrites && !snap.metadata.fromCache) {
          tidied = true;
          const ops = [...pruneLogOps(st.party, 300), ...pruneZeroOps('items', st.party.items)];
          if (ops.length > 20 || pruneZeroOps('items', st.party.items).length) applyPartyOps(campaignId, ops).catch(() => undefined);
        }
        after();
      },
      () => {
        st.loaded.party = true;
        after();
      },
    );
    const u2 = onSnapshot(
      satchelRef(campaignId, uid),
      (snap) => {
        st.satchel = snap.exists() ? (snap.data() as SatchelDoc) : null;
        st.loaded.satchel = true;
        if (!snap.metadata.hasPendingWrites) after();
      },
      () => {
        st.loaded.satchel = true;
        after();
      },
    );
    const u3 = onSnapshot(
      packsCol(campaignId),
      (snap) => {
        st.packs = snap.docs.map((d) => d.data() as PackDoc);
        st.loaded.packs = true;
        if (!snap.metadata.hasPendingWrites) after();
      },
      () => {
        st.loaded.packs = true;
        after();
      },
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, [campaignId, uid, isDM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messages from the codex frame.
  useEffect(() => {
    if (!campaignId || !uid) return;
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (sandboxed ? e.origin !== 'null' : e.origin !== CODEX_ORIGIN) return;
      const d = (e.data ?? {}) as { type?: string; changes?: { key: string; prev: unknown; next: unknown }[]; thing?: RecordThing; stage?: string; gift?: unknown };
      if (d.type === 'codex:ready') {
        // (Again after the codex reloads itself.)
        s.current.helloSent = false;
        s.current.wantsHello = true;
        sendHello();
      } else if (d.type === 'codex:save' && Array.isArray(d.changes)) {
        // Safety stop: people don't save dozens of times in a few seconds; a bug that makes two
        // devices keep "correcting" each other does, and would use up the day's free writes.
        const now = Date.now();
        const st = s.current;
        st.saves = [...st.saves.filter((t) => now - t < SAVE_WINDOW_MS), now];
        if (st.halted || st.saves.length > MAX_SAVES_PER_WINDOW) {
          if (!st.halted) {
            st.halted = true;
            logError('Codex', new Error(`Stopped saving: ${st.saves.length} saves in ${SAVE_WINDOW_MS / 1000}s`));
            toast.error(new Error('The codex kept saving over and over, so DnDocs stopped saving it to protect the daily database limit. Reload the page to carry on.'), 'Codex');
          }
          post({ type: 'dndocs:saved', ok: false, error: 'Saving paused (too many saves at once). Reload the page.' });
          return;
        }
        try {
          for (const c of d.changes) {
            // The codex's view now includes its own change; don't send it back.
            s.current.sent[c.key] = JSON.stringify(c.next);
            if (c.key === KEY_PARTY) {
              s.current.pending = true;
              await applyPartyOps(campaignId, partyOps(c.prev as CodexParty, c.next as CodexParty, { isDM }));
            } else if (c.key === KEY_HOMEBREW) {
              if (isDM) await savePacks(campaignId, packChanges(c.prev, c.next));
            } else {
              const ops = satchelOps(c.key, c.prev, c.next);
              if (ops.length) await applySatchelOps(campaignId, uid, ops);
            }
          }
        } catch (err) {
          post({ type: 'dndocs:saved', ok: false, error: err instanceof Error ? err.message : String(err) });
          toast.error(err, 'Save the codex');
        }
      } else if (d.type === 'codex:give') {
        const raw = d.gift as { id?: unknown } | null;
        const gift = cleanGift(d.gift);
        const to = gift && membersRef.current.find((m) => m.uid === gift.to);
        try {
          if (!gift || !to) throw new Error('That player isn’t in this campaign');
          await sendGift(campaignId, { uid, name: user?.displayName || 'Someone' }, gift);
          post({ type: 'dndocs:give', id: gift.id, ok: true });
        } catch (err) {
          post({ type: 'dndocs:give', id: typeof raw?.id === 'string' ? raw.id : '', ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      } else if (d.type === 'codex:bank' && isDM) {
        const raw = (d as { move?: { id?: unknown } }).move;
        const move = cleanBankMove(raw);
        const who = move && membersRef.current.find((m) => m.uid === move.uid && m.role !== 'dm');
        try {
          if (!move || !who) throw new Error('That player isn’t in this campaign');
          // Never take more than they have (the codex checks too, but two DMs could act at once).
          const have = who.items ?? {};
          const ops = [
            ...Object.entries(move.items).map(([id, q]) => ({ path: ['items', id], inc: q < 0 ? -Math.min(-q, have[id] ?? 0) : q })),
            ...(move.cp ? [{ path: ['cp'], inc: move.cp < 0 ? -Math.min(-move.cp, who.cp ?? 0) : move.cp }] : []),
          ].filter((o) => o.inc);
          if (ops.length) await applySatchelOps(campaignId, move.uid, ops);
          post({ type: 'dndocs:bank', id: move.id, ok: true });
        } catch (err) {
          post({ type: 'dndocs:bank', id: typeof raw?.id === 'string' ? raw.id : '', ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      } else if (d.type === 'codex:entry' && (d as { action?: string }).action === 'handout' && isDM) {
        const h = (d as { handout?: Partial<HandoutDraft> }).handout;
        if (h && typeof h.code === 'string') setHandout({ code: h.code, title: String(h.title || 'Handout').slice(0, 120), text: String(h.text || '').slice(0, 4000), what: Array.isArray(h.what) ? h.what.map(String).slice(0, 20) : [] });
      } else if (d.type === 'codex:entry' && d.thing && isDM) {
        setRecord(d.thing);
      } else if (d.type === 'codex:error' && d.stage === 'load' && sandboxed) {
        // The codex couldn't fetch its data from inside the sandbox: run it like the Forge instead.
        setSandboxed(false);
      }
    };
    window.addEventListener('message', onMessage);
    const t = setTimeout(() => !s.current.helloSent && setStatus((st) => (st === 'loading' ? 'stuck' : st)), 20_000);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(t);
    };
  }, [campaignId, uid, isDM, sandboxed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Someone joined (or a character got its player): the codex's list of people to give to.
  const membersKey = JSON.stringify(members);
  useEffect(() => {
    if (s.current.helloSent) post({ type: 'dndocs:members', members });
  }, [membersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new "open" (e.g. Harvest from a battle) while the codex is already showing.
  const lastOpen = useRef<CodexOpen | null>(open);
  useEffect(() => {
    if (open && open !== lastOpen.current && s.current.helloSent) post({ type: 'dndocs:open', open });
    lastOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentCampaign || !user) return null;

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      {status !== 'ready' && (
        <div className="flex items-center gap-3 border-b border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-300">
          <span className="min-w-0 flex-1">
            {status === 'loading' ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Opening the Scavenger’s Codex…
              </span>
            ) : (
              <>The Scavenger’s Codex isn’t answering. Check your connection and reload the page.</>
            )}
          </span>
          <a href={CODEX_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <ExternalLink size={14} /> On its own
          </a>
        </div>
      )}
      <iframe
        key={sandboxed ? 'sandboxed' : 'plain'}
        ref={frame}
        src={codexFrameUrl()}
        title="Scavenger's Codex"
        className="min-h-0 w-full flex-1 border-0 bg-stone-950"
        allow="clipboard-write"
        {...(sandboxed ? { sandbox: SANDBOX } : {})}
      />
      {handout && <HandoutModal draft={handout} onClose={() => setHandout(null)} />}
      {record && <RecordModal thing={record} onClose={() => setRecord(null)} onDone={(name, ok, error) => post({ type: 'dndocs:entry', ok, name, error })} />}
    </div>
  );
}

interface HandoutDraft {
  code: string;
  title: string;
  text: string;
  what: string[];
}

/** DM: post a codex handout as a DnDocs note. Opening its link unlocks the codex entries for the party. */
function HandoutModal({ draft, onClose }: { draft: HandoutDraft; onClose: () => void }) {
  const { user, currentCampaign } = useAuth();
  const { players } = useCampaignData();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(draft.title);
  const [text, setText] = useState(draft.text);
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const link = `/codex?open=${encodeURIComponent(`#/journal/${draft.code}`)}`;
  const save = async () => {
    if (!currentCampaign || !user || !title.trim() || (!everyone && !chosen.length)) return;
    setSaving(true);
    try {
      const content = [text.trim(), draft.what.length > 1 ? `*${draft.what.join(' · ')}*` : '', `[Open it in the Scavenger's Codex](${link}) · code **${draft.code}**`].filter(Boolean).join('\n\n');
      const e = await quickCreateEntity({ campaign: currentCampaign, user, name: title.trim(), type: 'note', content, tags: ['handout'] });
      const now = Date.now();
      await applySharingUpdate(e.id, {
        isPublic: everyone,
        allowedPlayers: everyone ? [] : chosen,
        ...(show ? { lastPushedAt: now, lastPushedTo: everyone ? [] : chosen } : {}),
      });
      toast.show(`Posted “${title.trim()}” for ${everyone ? 'everyone' : `${chosen.length} player${chosen.length === 1 ? '' : 's'}`}`, { action: { label: 'Open', onClick: () => navigate(`/entity/${e.id}`) } });
      onClose();
    } catch (err) {
      toast.error(err, 'Post handout');
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Post a handout in DnDocs"
      description="It becomes a note for your players. Its link opens the Codex and unlocks what it's about for the whole party."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !title.trim() || (!everyone && !chosen.length)}>
            {saving ? 'Posting…' : 'Post handout'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="block">
          <span className="label">The note</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <fieldset className="space-y-2">
          <legend className="label">Who gets it</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={everyone} onChange={() => setEveryone(true)} /> Everyone in the campaign
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={!everyone} onChange={() => setEveryone(false)} /> Only…
          </label>
          {!everyone && (
            <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
              {players.map((p) => (
                <label key={p.uid} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={chosen.includes(p.uid)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p.uid] : c.filter((x) => x !== p.uid)))} />
                  {p.displayName}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show it on their screens now
        </label>
      </div>
    </Modal>
  );
}

const CATEGORY: Record<string, string> = { weapon: 'Weapon', ammunition: 'Weapon', armor: 'Armor', potion: 'Potion', oil: 'Potion', poison: 'Potion', scroll: 'Scroll' };

/**
 * DM: a DnDocs page for something from the codex (lore, pictures, secrets). Who carries it is the
 * satchels' business, so the page has no location of its own.
 */
function RecordModal({ thing, onClose, onDone }: { thing: RecordThing; onClose: () => void; onDone: (name: string, ok: boolean, error?: string) => void }) {
  const { user, currentCampaign } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!currentCampaign || !user) return;
    setSaving(true);
    try {
      const e = await quickCreateEntity({
        campaign: currentCampaign,
        user,
        name: thing.name,
        type: 'item',
        locationId: null,
        content: thing.desc ?? '',
        tags: ['codex'],
        attributes: {
          codexRef: thing.id,
          itemCategory: thing.kind === 'material' ? 'Other' : (thing.cat && CATEGORY[thing.cat]) || 'Equipment',
          attunement: !!thing.attune,
        },
      });
      onDone(thing.name, true);
      toast.show(`Made a page for “${thing.name}” (secret until you reveal it)`, { action: { label: 'Open', onClick: () => navigate(`/entity/${e.id}`) } });
      onClose();
    } catch (err) {
      onDone(thing.name, false, err instanceof Error ? err.message : String(err));
      toast.error(err, 'Make a page');
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`A DnDocs page for “${thing.name}”`}>
      <div className="space-y-4">
        <p className="text-sm text-stone-400">
          An item entry linked to the Codex, for its lore, pictures and secrets. It starts secret; reveal it when the party should see it. Who carries it stays in the Codex satchels, and the page shows that by itself.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Make the page'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
