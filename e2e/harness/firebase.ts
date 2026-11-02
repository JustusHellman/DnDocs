import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
export const app = initializeApp({ projectId: 'demo-harness', apiKey: 'demo', appId: 'demo' });
export let cacheIsPersistent = false;
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
