/**
 * The Scavenger's Codex inside DnDocs. The codex stays its own site (one copy of the code, also
 * usable on its own); DnDocs shows it in a frame and saves its state to the campaign, so the whole
 * party shares one satchel, clock, workbench and garden, and every player has their own satchel.
 *
 *   Codex  → DnDocs  { type: 'codex:ready' }                     loaded, waiting for hello
 *   DnDocs → Codex   { type: 'dndocs:hello', role, name, campaign, keys, open? }
 *   DnDocs → Codex   { type: 'dndocs:state', keys }               someone else changed something
 *   Codex  → DnDocs  { type: 'codex:save', changes: [{ key, prev, next }] }
 *   DnDocs → Codex   { type: 'dndocs:saved', ok, error? }         only when saving failed
 *   DnDocs → Codex   { type: 'dndocs:open', open: { hash } | { fight: [{ id, n }] } }
 *   Codex  → DnDocs  { type: 'codex:entry', action: 'record', thing }   DM: make a DnDocs item
 *   Codex  → DnDocs  { type: 'codex:error', stage: 'load' }      its data didn't load
 *
 * The frame is sandboxed without allow-same-origin, so the codex can't read DnDocs' sign-in even
 * though both live on justushellman.github.io. Messages are only accepted from that frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { Modal } from '../components/ui/Modal';
import { quickCreateEntity } from '../lib/entityService';
import { baseType } from '../lib/entityTypes';
import { CODEX_URL, codexFrameUrl } from '../lib/codex/catalog';
import {
  applyPartyOps,
  applySatchelOps,
  packsCol,
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
import type { Entity } from '../types';

const CODEX_ORIGIN = new URL(CODEX_URL, location.href).origin;
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
  const location = useLocation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [sandboxed, setSandboxed] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'stuck'>('loading');
  const [record, setRecord] = useState<RecordThing | null>(null);

  // Where to start: a codex page (?open=#/monster/dire-wolf) or a battle's fallen (router state).
  const open = useMemo<CodexOpen | null>(() => {
    const st = location.state as { codexOpen?: CodexOpen } | null;
    if (st?.codexOpen) return st.codexOpen;
    const h = new URLSearchParams(location.search).get('open');
    return h && h.startsWith('#/') ? { hash: h } : null;
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const campaignId = currentCampaign?.id;
  const uid = user?.uid;

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
  });
  s.current.open = open;

  const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, sandboxed ? '*' : CODEX_ORIGIN);

  const allLoaded = () => s.current.loaded.party && s.current.loaded.satchel && s.current.loaded.packs;
  const keysNow = () => codexKeys(s.current.party, s.current.satchel, s.current.packs);

  const sendHello = () => {
    if (!allLoaded() || !currentCampaign || !user) return;
    const keys = keysNow();
    s.current.sent = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, JSON.stringify(v)]));
    post({ type: 'dndocs:hello', role: isDM ? 'dm' : 'player', name: user.displayName, campaign: { id: currentCampaign.id, name: currentCampaign.name }, keys, open: s.current.open });
    s.current.helloSent = true;
    s.current.wantsHello = false;
    setStatus('ready');
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
      const d = (e.data ?? {}) as { type?: string; changes?: { key: string; prev: unknown; next: unknown }[]; thing?: RecordThing; stage?: string };
      if (d.type === 'codex:ready') {
        // (Again after the codex reloads itself.)
        s.current.helloSent = false;
        s.current.wantsHello = true;
        sendHello();
      } else if (d.type === 'codex:save' && Array.isArray(d.changes)) {
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
      {record && <RecordModal thing={record} onClose={() => setRecord(null)} onDone={(name, ok, error) => post({ type: 'dndocs:entry', ok, name, error })} />}
    </div>
  );
}

const CATEGORY: Record<string, string> = { weapon: 'Weapon', ammunition: 'Weapon', armor: 'Armor', potion: 'Potion', oil: 'Potion', poison: 'Potion', scroll: 'Scroll' };
const HOLDER_TYPES = ['character', 'npc', 'shop'];

/** DM: make a DnDocs item entry for something from the codex, on the character (or NPC, shop) who has it. */
function RecordModal({ thing, onClose, onDone }: { thing: RecordThing; onClose: () => void; onDone: (name: string, ok: boolean, error?: string) => void }) {
  const { user, currentCampaign } = useAuth();
  const { entities } = useCampaignData();
  const toast = useToast();
  const navigate = useNavigate();
  const [holder, setHolder] = useState('');
  const [saving, setSaving] = useState(false);
  const holders = useMemo(
    () =>
      entities
        .filter((e: Entity) => HOLDER_TYPES.includes(baseType(e.type)) || e.type === 'character')
        .sort((a, b) => Number(b.type === 'character') - Number(a.type === 'character') || a.name.localeCompare(b.name)),
    [entities],
  );
  const save = async () => {
    if (!currentCampaign || !user) return;
    setSaving(true);
    try {
      const e = await quickCreateEntity({
        campaign: currentCampaign,
        user,
        name: thing.name,
        type: 'item',
        locationId: holder || null,
        content: thing.desc ?? '',
        tags: ['codex'],
        attributes: {
          codexRef: thing.id,
          itemCategory: thing.kind === 'material' ? 'Other' : (thing.cat && CATEGORY[thing.cat]) || 'Equipment',
          attunement: !!thing.attune,
        },
      });
      onDone(thing.name, true);
      toast.show(`Recorded “${thing.name}” in DnDocs (secret until you reveal it)`, { action: { label: 'Open', onClick: () => navigate(`/entity/${e.id}`) } });
      onClose();
    } catch (err) {
      onDone(thing.name, false, err instanceof Error ? err.message : String(err));
      toast.error(err, 'Record item');
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Record “${thing.name}” in DnDocs`}>
      <div className="space-y-4">
        <p className="text-sm text-stone-400">Makes an item entry linked to the codex. It starts secret; reveal it when the party should see it.</p>
        <label className="block">
          <span className="label">Who has it?</span>
          <select className="input" value={holder} onChange={(e) => setHolder(e.target.value)}>
            <option value="">Nobody yet</option>
            {holders.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Record item'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
