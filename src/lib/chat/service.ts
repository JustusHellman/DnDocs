/**
 * The table chat lives in Firebase's Realtime Database, not Firestore. It's on the free plan too,
 * but it isn't counted per read and write (only data stored and downloaded, and a chat line is a
 * few hundred bytes), so chatting and rolling never touch the Firestore daily limits.
 *
 *   rooms/{campaignId}/owner             the campaign owner's uid (claimed once by the owner's app)
 *   rooms/{campaignId}/members/{uid}     'dm' | 'player'  (kept in step by the owner's app)
 *   rooms/{campaignId}/messages/{id}     what everyone in the campaign sees
 *   rooms/{campaignId}/secret/{id}       DM rolls behind the screen: DMs only
 *
 * The Realtime Database's rules can't look at Firestore, which is why the owner's app keeps a copy
 * of who is in the campaign under `members` (see database.rules.json).
 */
import firebaseConfig from '../../../firebase-applet-config.json';
import type { Campaign, User } from '../../types';
import { logError } from '../errors';
import type { ChatRoll } from './rolls';
import { parseEvent, type TableEvent } from './events';

const DATABASE_URL: string | undefined =
  (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined) || (firebaseConfig as { databaseURL?: string }).databaseURL;

/** Whether the project has a Realtime Database set up (see the README). */
export const chatAvailable = !!DATABASE_URL;

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  at: number;
  /** text: a message. roll: dice everyone sees. hidden: "the DM rolls behind the screen" (no result).
   *  event: something that happened at the table (a spell cast, a slot used, a rest…). */
  kind: 'text' | 'roll' | 'hidden' | 'event';
  text?: string;
  roll?: ChatRoll;
  ev?: TableEvent;
  /** A whisper: only the two of them (and the DM) see it. */
  whisper?: { to: string; toName: string };
  /** Only in the DMs' copy: a roll the players don't see. */
  secret?: boolean;
}

type Db = import('firebase/database').Database;
type DbModule = typeof import('firebase/database');
let loading: Promise<{ db: Db; m: DbModule }> | null = null;

/** The Realtime Database, loaded only when the chat is first used (keeps the app's start fast). */
export function chatDb() {
  return rtdb();
}
function rtdb() {
  if (!DATABASE_URL) return Promise.reject(new Error('The table chat needs a Realtime Database (see the README).'));
  loading ??= Promise.all([import('firebase/database'), import('../../firebase')]).then(([m, f]) => ({ db: m.getDatabase(f.app, DATABASE_URL), m }));
  return loading;
}

const room = (campaignId: string) => `rooms/${campaignId}`;
const KEEP = 80;

function toMessage(id: string, v: Record<string, unknown>, secret = false): ChatMessage | null {
  if (!v || typeof v.uid !== 'string' || typeof v.at !== 'number') return null;
  let roll: ChatRoll | undefined;
  if (typeof v.r === 'string') {
    try {
      roll = JSON.parse(v.r) as ChatRoll;
    } catch {
      roll = undefined;
    }
  }
  return {
    id,
    uid: v.uid,
    name: typeof v.name === 'string' ? v.name : 'Someone',
    at: v.at,
    kind: v.kind === 'roll' || v.kind === 'hidden' || v.kind === 'event' ? v.kind : 'text',
    ...(typeof v.text === 'string' ? { text: v.text } : {}),
    ...(typeof v.e === 'string' ? { ev: parseEvent(v.e) } : {}),
    ...(typeof v.to === 'string' ? { whisper: { to: v.to, toName: typeof v.toName === 'string' ? v.toName : '' } } : {}),
    ...(roll ? { roll } : {}),
    ...(secret ? { secret: true } : {}),
  };
}

export type ChatStatus = 'connecting' | 'ready' | 'waiting' | 'unavailable';

/**
 * The latest messages (and, for DMs, the secret rolls), live. `waiting`: this account isn't in
 * the chat's member list yet (the owner's app adds new players the next time it's open).
 */
export function listenChat(campaignId: string, isDM: boolean, onData: (messages: ChatMessage[]) => void, onStatus: (s: ChatStatus) => void, me?: string): () => void {
  let stopped = false;
  const unsubs: (() => void)[] = [];
  let pub: ChatMessage[] = [];
  let sec: ChatMessage[] = [];
  let wsp: ChatMessage[] = [];
  // DMs see the real secret rolls, so the players' "rolls behind the screen" lines are noise for them.
  const emit = () => onData([...(isDM ? pub.filter((m) => m.kind !== 'hidden') : pub), ...sec, ...wsp].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(-KEEP));
  if (!chatAvailable) {
    onStatus('unavailable');
    return () => undefined;
  }
  onStatus('connecting');
  rtdb()
    .then(({ db, m }) => {
      if (stopped) return;
      const listen = (path: string, secret: boolean, set: (list: ChatMessage[]) => void) =>
        m.onValue(
          m.query(m.ref(db, path), m.orderByChild('at'), m.limitToLast(KEEP)),
          (snap) => {
            const list: ChatMessage[] = [];
            snap.forEach((c) => {
              const msg = toMessage(c.key!, c.val() as Record<string, unknown>, secret);
              if (msg) list.push(msg);
            });
            set(list);
            onStatus('ready');
            emit();
          },
          (err) => {
            if (/permission/i.test(String(err))) onStatus('waiting');
            else logError('Table chat', err);
          },
        );
      unsubs.push(listen(`${room(campaignId)}/messages`, false, (l) => (pub = l)));
      if (isDM) unsubs.push(listen(`${room(campaignId)}/secret`, true, (l) => (sec = l)));
      // Whispers: your own box (the DM: everyone's; each whisper is in both people's boxes, under one id).
      if (me) {
        const path = isDM ? `${room(campaignId)}/whispers` : `${room(campaignId)}/whispers/${me}`;
        unsubs.push(
          m.onValue(
            m.ref(db, path),
            (snap) => {
              const seen = new Map<string, ChatMessage>();
              const add = (c: { key: string | null; val: () => unknown }) => {
                const msg = toMessage(c.key!, c.val() as Record<string, unknown>);
                if (msg) seen.set(msg.id, msg);
              };
              snap.forEach((c) => {
                if (isDM) c.forEach((w) => void add(w));
                else add(c);
              });
              wsp = [...seen.values()].sort((a, b) => a.at - b.at).slice(-KEEP);
              emit();
            },
            () => undefined,
          ),
        );
      }
    })
    .catch((err) => {
      logError('Table chat', err);
      onStatus('unavailable');
    });
  return () => {
    stopped = true;
    unsubs.forEach((u) => u());
  };
}

async function post(campaignId: string, where: 'messages' | 'secret', data: Record<string, unknown>): Promise<string | null> {
  const { db, m } = await rtdb();
  const r = await m.push(m.ref(db, `${room(campaignId)}/${where}`), { ...data, at: m.serverTimestamp() });
  return r.key;
}

/** Something that happened at the table, for everyone (a spell cast, a slot used, a rest…). */
export function sendEvent(campaignId: string, user: Pick<User, 'uid' | 'displayName'>, ev: TableEvent) {
  return post(campaignId, 'messages', { uid: user.uid, name: user.displayName.slice(0, 60), kind: 'event', e: JSON.stringify(ev).slice(0, 4000) });
}

/** A whisper: written to both people's boxes under the same id (the DM reads all boxes). */
export async function sendWhisper(campaignId: string, user: Pick<User, 'uid' | 'displayName'>, to: { uid: string; name: string }, text: string) {
  const t = text.trim().slice(0, 500);
  if (!t) return;
  const { db, m } = await rtdb();
  const id = m.push(m.ref(db, `${room(campaignId)}/whispers/${user.uid}`)).key!;
  const data = { uid: user.uid, name: user.displayName.slice(0, 60), to: to.uid, toName: to.name.slice(0, 60), text: t, at: m.serverTimestamp() };
  await m.update(m.ref(db), {
    [`${room(campaignId)}/whispers/${user.uid}/${id}`]: data,
    ...(to.uid !== user.uid ? { [`${room(campaignId)}/whispers/${to.uid}/${id}`]: data } : {}),
  });
}

/** Take back your own message (e.g. an "Undo" of a slot used). */
export async function deleteMessage(campaignId: string, id: string) {
  const { db, m } = await rtdb();
  await m.remove(m.ref(db, `${room(campaignId)}/messages/${id}`));
}

export function sendText(campaignId: string, user: Pick<User, 'uid' | 'displayName'>, text: string) {
  const t = text.trim().slice(0, 500);
  if (!t) return Promise.resolve();
  return post(campaignId, 'messages', { uid: user.uid, name: user.displayName.slice(0, 60), kind: 'text', text: t });
}

/**
 * A roll for the table. A DM's hidden roll goes to the DMs' secret list, and the players only get
 * "the DM rolls behind the screen" (no result).
 */
export async function sendRoll(campaignId: string, user: Pick<User, 'uid' | 'displayName'>, roll: ChatRoll, hidden = false) {
  const base = { uid: user.uid, name: user.displayName.slice(0, 60) };
  if (!hidden) return post(campaignId, 'messages', { ...base, kind: 'roll', r: JSON.stringify(roll) });
  await post(campaignId, 'secret', { ...base, kind: 'roll', r: JSON.stringify(roll) });
  await post(campaignId, 'messages', { ...base, kind: 'hidden' });
}

/**
 * The owner's app: claim the room (once) and keep its member list in step with the campaign, so the
 * chat's rules know who may read and write. Also tidies away messages older than three weeks.
 */
/** Resolves true when it changed the room (claimed it, or updated who's in it). */
export async function syncChatRoom(campaign: Campaign, uid: string): Promise<boolean> {
  if (!chatAvailable || campaign.dmId !== uid) return false;
  const members: Record<string, 'dm' | 'player'> = { [campaign.dmId]: 'dm' };
  for (const p of campaign.players ?? []) members[p] = 'player';
  for (const d of campaign.coDms ?? []) members[d] = 'dm';
  const key = `dndocs-chat-members:${campaign.id}`;
  const want = JSON.stringify(members);
  try {
    const { db, m } = await rtdb();
    const ownerRef = m.ref(db, `${room(campaign.id)}/owner`);
    const owner = await m.get(ownerRef);
    if (!owner.exists()) await m.set(ownerRef, uid);
    let known: string | null = null;
    try {
      known = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    const changed = known !== want || !owner.exists();
    if (changed) {
      await m.set(m.ref(db, `${room(campaign.id)}/members`), members);
      try {
        localStorage.setItem(key, want);
      } catch {
        /* ignore */
      }
    }
    // Old messages: nobody scrolls back weeks, and the room stays small.
    const cutoff = Date.now() - 21 * 24 * 3600_000;
    for (const where of ['messages', 'secret'] as const) {
      const old = await m.get(m.query(m.ref(db, `${room(campaign.id)}/${where}`), m.orderByChild('at'), m.endAt(cutoff), m.limitToFirst(200)));
      const gone: Record<string, null> = {};
      old.forEach((c) => {
        gone[c.key!] = null;
      });
      if (Object.keys(gone).length) await m.update(m.ref(db, `${room(campaign.id)}/${where}`), gone);
    }
    return changed;
  } catch (err) {
    logError('Table chat setup', err);
    return false;
  }
}

/**
 * Everyone's table colour, live (rooms/{campaignId}/colors/{uid}). One small listener for the
 * whole campaign: chat lines, dice, pings and tokens all look their colour up from this, so it
 * costs nothing per message.
 */
export function listenColors(campaignId: string, onData: (colors: Record<string, string>) => void): () => void {
  if (!chatAvailable) return () => undefined;
  let stopped = false;
  let unsub: (() => void) | null = null;
  rtdb()
    .then(({ db, m }) => {
      if (stopped) return;
      unsub = m.onValue(
        m.ref(db, `${room(campaignId)}/colors`),
        (snap) => {
          const out: Record<string, string> = {};
          snap.forEach((c) => {
            const v = c.val();
            if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[c.key!] = v;
          });
          onData(out);
        },
        (err) => {
          if (!/permission/i.test(String(err))) logError('Table colours', err);
        },
      );
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    unsub?.();
  };
}

/** Your colour (or, for a DM, anyone's). */
export async function setTableColor(campaignId: string, uid: string, hex: string) {
  const { db, m } = await rtdb();
  await m.set(m.ref(db, `${room(campaignId)}/colors/${uid}`), hex.toLowerCase());
}
