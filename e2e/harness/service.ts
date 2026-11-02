import type { TableEvent } from '../../src/lib/chat/events';
import type { ChatRoll } from '../../src/lib/chat/rolls';
export const chatAvailable = true;
export interface ChatMessage { id: string; uid: string; name: string; at: number; kind: 'text' | 'roll' | 'hidden' | 'event'; text?: string; roll?: ChatRoll; ev?: TableEvent; whisper?: { to: string; toName: string }; secret?: boolean }
export type ChatStatus = 'connecting' | 'ready' | 'waiting' | 'unavailable';
export function chatDb(): Promise<never> { return Promise.reject(new Error('harness')); }
let msgs: ChatMessage[] = [];
let emitter: ((m: ChatMessage[]) => void) | null = null;
let n = 0;
const push = (m: Omit<ChatMessage, 'id' | 'at'> & { at?: number }) => { const id = `m${++n}`; msgs = [...msgs, { at: Date.now(), ...m, id } as ChatMessage]; emitter?.(msgs); return id; };
export const seed = (list: (Omit<ChatMessage, 'id' | 'at'> & { ago: number })[]) => { for (const m of list) { const { ago, ...rest } = m; push({ ...rest, at: Date.now() - ago * 1000 - 60_000 }); } };
export const messages = () => msgs;
export const inject = (m: Omit<ChatMessage, 'id' | 'at'>) => push(m);
export function listenChat(_c: string, _dm: boolean, onData: (m: ChatMessage[]) => void, onStatus: (s: ChatStatus) => void) { emitter = onData; onStatus('ready'); onData(msgs); return () => { emitter = null; }; }
export async function sendEvent(_c: string, u: { uid: string; displayName: string }, ev: TableEvent) { return push({ uid: u.uid, name: u.displayName, kind: 'event', ev }); }
export async function sendWhisper(_c: string, u: { uid: string; displayName: string }, to: { uid: string; name: string }, text: string) { push({ uid: u.uid, name: u.displayName, kind: 'text', text, whisper: { to: to.uid, toName: to.name } }); }
export async function deleteMessage(_c: string, id: string) { msgs = msgs.filter((m) => m.id !== id); emitter?.(msgs); }
export async function sendText(_c: string, u: { uid: string; displayName: string }, text: string) { push({ uid: u.uid, name: u.displayName, kind: 'text', text }); }
export async function sendRoll(_c: string, u: { uid: string; displayName: string }, roll: ChatRoll, hidden = false) { push({ uid: u.uid, name: u.displayName, kind: 'roll', roll, ...(hidden ? { secret: true } : {}) }); }
export async function syncChatRoom() { return false; }
export function listenColors(_c: string, on: (c: Record<string, string>) => void) { on({ dm1: '#c2410c', p1: '#7c3aed', p2: '#0f766e' }); return () => undefined; }
export async function setTableColor() {}
