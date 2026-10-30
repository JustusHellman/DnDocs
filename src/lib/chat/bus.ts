/**
 * How the rest of DnDocs talks to the table chat (which is always mounted): post an event, share a
 * roll (with the dice animation), add a line only you see, open the chat. The chat registers
 * itself; until it has, these quietly do nothing.
 */
import type { TableEvent } from './events';
import type { ChatRoll } from './rolls';

export interface ChatBus {
  event: (ev: TableEvent) => Promise<string | null>;
  roll: (roll: ChatRoll) => void;
  note: (text: string) => void;
  remove: (messageId: string) => Promise<void>;
}

let bus: ChatBus | null = null;
export const setChatBus = (b: ChatBus | null) => {
  bus = b;
};
export const tableChat: ChatBus = {
  event: (ev) => (bus ? bus.event(ev) : Promise.resolve(null)),
  roll: (r) => bus?.roll(r),
  note: (t) => bus?.note(t),
  remove: (id) => (bus ? bus.remove(id) : Promise.resolve()),
};
