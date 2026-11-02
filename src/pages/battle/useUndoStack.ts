import { useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

export interface UndoEntry {
  label: string;
  run: () => Promise<unknown>;
}
export type PushUndo = (label: string, run: () => Promise<unknown>, announce?: boolean) => void;

/**
 * Each person's own recent changes on the battle map, newest first (this device, this visit).
 * `push(label, run, announce)`: `announce` says it on screen with an Undo button — "…— done" for
 * something you did, the label as it is for something that happened by itself ("…(attacked)").
 */
export function useUndoStack() {
  const toast = useToast();
  const stack = useRef<UndoEntry[]>([]);
  const [count, setCount] = useState(0);
  const undo = async (which?: UndoEntry) => {
    const i = which ? stack.current.lastIndexOf(which) : stack.current.length - 1;
    if (i < 0) return;
    const [entry] = stack.current.splice(i, 1);
    setCount(stack.current.length);
    if (!entry) return;
    try {
      await entry.run();
      toast.show(`Undone: ${entry.label}`);
    } catch (err) {
      toast.error(err, `Undo ${entry.label.toLowerCase()}`);
    }
  };
  const push: PushUndo = (label, run, announce = false) => {
    const entry: UndoEntry = { label, run };
    stack.current.push(entry);
    if (stack.current.length > 40) stack.current.shift();
    setCount(stack.current.length);
    if (announce) toast.show(/[.)]$/.test(label) ? label : `${label} — done`, { action: { label: 'Undo', onClick: () => undo(entry) }, duration: 8000 });
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  return { push, undo, undoRef, count, last: count ? stack.current[stack.current.length - 1] : undefined };
}
