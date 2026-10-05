import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

/**
 * Offline cache: Firestore keeps a copy of the campaign in the browser (IndexedDB), so the app
 * opens instantly, keeps working on bad Wi-Fi at the table, and only downloads what changed —
 * which saves most of the free-tier daily reads. Falls back to memory where IndexedDB is blocked.
 */
function createDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache() }, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createDb();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// `npm run dev:emulator` runs the app against local Firebase emulators (see README)
// so you can experiment without touching real campaign data.
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
