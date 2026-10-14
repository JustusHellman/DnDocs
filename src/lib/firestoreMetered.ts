/**
 * 'firebase/firestore' with a meter on it (vite.config.ts points the app's imports here).
 * Everything is the real SDK; writes and server reads are also reported to lib/dbMeter.ts so the
 * DM can see what uses the free plan's daily quota. Nothing else changes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from '@firebase/firestore';
import { recordRead, recordWrite } from './dbMeter';

export * from '@firebase/firestore';

const pathOf = (ref: unknown): string => {
  const r = ref as { path?: unknown; _query?: { path?: { canonicalString?: () => string } } } | null;
  if (typeof r?.path === 'string') return r.path;
  try {
    return r?._query?.path?.canonicalString?.() ?? '?';
  } catch {
    return '?';
  }
};

export const setDoc = ((ref: any, ...rest: any[]) => {
  recordWrite('set', pathOf(ref));
  return (fs.setDoc as any)(ref, ...rest);
}) as typeof fs.setDoc;

export const updateDoc = ((ref: any, ...rest: any[]) => {
  recordWrite('update', pathOf(ref));
  return (fs.updateDoc as any)(ref, ...rest);
}) as typeof fs.updateDoc;

export const deleteDoc = ((ref: any) => {
  recordWrite('delete', pathOf(ref));
  return fs.deleteDoc(ref);
}) as typeof fs.deleteDoc;

export const addDoc = ((ref: any, data: any) => {
  recordWrite('add', pathOf(ref));
  return fs.addDoc(ref, data);
}) as typeof fs.addDoc;

/** A batch counts its writes when it's committed (one per document, like the bill). */
export const writeBatch = ((db: fs.Firestore) => {
  const b = fs.writeBatch(db);
  const ops: [Parameters<typeof recordWrite>[0], string][] = [];
  const wrapped: any = {
    set: (ref: any, ...rest: any[]) => (ops.push(['set', pathOf(ref)]), (b.set as any)(ref, ...rest), wrapped),
    update: (ref: any, ...rest: any[]) => (ops.push(['update', pathOf(ref)]), (b.update as any)(ref, ...rest), wrapped),
    delete: (ref: any) => (ops.push(['delete', pathOf(ref)]), b.delete(ref), wrapped),
    commit: () => {
      for (const [op, p] of ops) recordWrite(op, p);
      return b.commit();
    },
  };
  return wrapped as fs.WriteBatch;
}) as typeof fs.writeBatch;

export const runTransaction = ((db: fs.Firestore, update: (tx: fs.Transaction) => Promise<unknown>, options?: fs.TransactionOptions) =>
  fs.runTransaction(
    db,
    (tx) => {
      const counted: any = {
        get: (ref: any) =>
          tx.get(ref).then((s) => {
            recordRead(pathOf(ref), 1);
            return s;
          }),
        set: (ref: any, ...rest: any[]) => (recordWrite('set', pathOf(ref)), (tx.set as any)(ref, ...rest), counted),
        update: (ref: any, ...rest: any[]) => (recordWrite('update', pathOf(ref)), (tx.update as any)(ref, ...rest), counted),
        delete: (ref: any) => (recordWrite('delete', pathOf(ref)), tx.delete(ref), counted),
      };
      return update(counted);
    },
    options,
  )) as typeof fs.runTransaction;

// --- reads: only what came from the server is billed --------------------------------------------

const countDoc = (ref: unknown, snap: fs.DocumentSnapshot) => {
  if (!snap.metadata.fromCache) recordRead(pathOf(ref), 1);
  return snap;
};
const countQuery = (q: unknown, snap: fs.QuerySnapshot) => {
  // An empty answer still costs one read.
  if (!snap.metadata.fromCache) recordRead(pathOf(q), Math.max(1, snap.size));
  return snap;
};

export const getDoc = ((ref: any) => fs.getDoc(ref).then((s) => countDoc(ref, s))) as typeof fs.getDoc;
export const getDocFromServer = ((ref: any) => fs.getDocFromServer(ref).then((s) => countDoc(ref, s))) as typeof fs.getDocFromServer;
export const getDocs = ((q: any) => fs.getDocs(q).then((s) => countQuery(q, s))) as typeof fs.getDocs;
export const getDocsFromServer = ((q: any) => fs.getDocsFromServer(q).then((s) => countQuery(q, s))) as typeof fs.getDocsFromServer;

/** Listeners: each document the server sends (first answer, then every change) is a read. */
export const onSnapshot = ((ref: any, ...args: any[]) => {
  const count = (snap: any) => {
    if (!snap?.metadata || snap.metadata.fromCache) return;
    if (typeof snap.docChanges === 'function') {
      if (snap.metadata.hasPendingWrites) return; // our own write, shown before the server has it
      const n = snap.docChanges().length;
      if (n) recordRead(pathOf(ref), n);
    } else if (!snap.metadata.hasPendingWrites) recordRead(pathOf(ref), 1);
  };
  const i = args.findIndex((a) => typeof a === 'function' || (a && typeof a === 'object' && typeof a.next === 'function'));
  if (i < 0) return (fs.onSnapshot as any)(ref, ...args);
  const a = args[i];
  const out = [...args];
  if (typeof a === 'function') {
    out[i] = (snap: any) => {
      count(snap);
      return a(snap);
    };
  } else {
    out[i] = {
      ...a,
      next: (snap: any) => {
        count(snap);
        return a.next(snap);
      },
      error: a.error?.bind(a),
      complete: a.complete?.bind(a),
    };
  }
  return (fs.onSnapshot as any)(ref, ...out);
}) as typeof fs.onSnapshot;
