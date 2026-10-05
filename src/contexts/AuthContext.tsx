import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateAuthProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { clearIndexedDbPersistence, doc, getDoc, onSnapshot, setDoc, terminate } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import type { Campaign, User } from '../types';
import { logError } from '../lib/errors';
import { registerJoinCode } from '../lib/entityService';

const CAMPAIGN_KEY = 'currentCampaignId';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  currentCampaign: Campaign | null;
  setCurrentCampaign: (campaign: Campaign | null) => void;
  /** Owner or co-DM of the current campaign. */
  isDM: boolean;
  /** The DM who created the current campaign. */
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readSavedCampaign(): string | null {
  try {
    return localStorage.getItem(CAMPAIGN_KEY);
  } catch {
    return null;
  }
}

function saveCampaignId(id: string | null) {
  try {
    if (id) localStorage.setItem(CAMPAIGN_KEY, id);
    else localStorage.removeItem(CAMPAIGN_KEY);
  } catch {
    /* private mode */
  }
}

async function ensureUserDoc(fUser: FirebaseUser, displayName?: string): Promise<User> {
  const ref = doc(db, 'users', fUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as User;
  const data: User = {
    uid: fUser.uid,
    displayName: displayName || fUser.displayName || fUser.email?.split('@')[0] || 'Adventurer',
    email: fUser.email || 'unknown',
    createdAt: new Date().toISOString(),
    ...(fUser.photoURL ? { photoURL: fUser.photoURL } : {}),
  };
  await setDoc(ref, data);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [restoringCampaign, setRestoringCampaign] = useState(() => !!readSavedCampaign());
  const [currentCampaign, setCampaignState] = useState<Campaign | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(() => readSavedCampaign());

  // Auth state + live user profile
  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, async (fUser) => {
      unsubUser?.();
      unsubUser = undefined;
      setFirebaseUser(fUser);
      if (!fUser) {
        setUser(null);
        setCampaignState(null);
        setRestoringCampaign(false);
        setAuthReady(true);
        return;
      }
      try {
        setUser(await ensureUserDoc(fUser));
      } catch (err) {
        logError('Loading user profile', err);
      }
      unsubUser = onSnapshot(
        doc(db, 'users', fUser.uid),
        (snap) => snap.exists() && setUser(snap.data() as User),
        (err) => logError('User profile listener', err),
      );
      setAuthReady(true);
    });
    return () => {
      unsubAuth();
      unsubUser?.();
    };
  }, []);

  // Live campaign document (restores the last opened campaign on reload)
  useEffect(() => {
    if (!firebaseUser || !campaignId) {
      setCampaignState(null);
      if (authReady) setRestoringCampaign(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'campaigns', campaignId),
      (snap) => {
        if (snap.exists()) {
          setCampaignState(snap.data() as Campaign);
        } else {
          setCampaignState(null);
          setCampaignId(null);
          saveCampaignId(null);
        }
        setRestoringCampaign(false);
      },
      (err) => {
        logError('Campaign listener', err);
        setCampaignState(null);
        setCampaignId(null);
        saveCampaignId(null);
        setRestoringCampaign(false);
      },
    );
    return unsub;
  }, [firebaseUser, campaignId, authReady]);

  const setCurrentCampaign = useCallback((campaign: Campaign | null) => {
    setCampaignState(campaign);
    setCampaignId(campaign?.id ?? null);
    saveCampaignId(campaign?.id ?? null);
  }, []);

  const isOwner = !!user && currentCampaign?.dmId === user.uid;
  const isDM = isOwner || (!!user && !!currentCampaign?.coDms?.includes(user.uid));

  // Make sure older campaigns get a join-code lookup document (needed by the tightened rules).
  useEffect(() => {
    if (isOwner && currentCampaign) registerJoinCode(currentCampaign);
  }, [isOwner, currentCampaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      firebaseUser,
      loading: !authReady || (!!firebaseUser && !user) || restoringCampaign,
      login: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      loginWithEmail: async (email, pass) => {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
      },
      registerWithEmail: async (email, pass, displayName) => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        if (displayName) await updateAuthProfile(cred.user, { displayName }).catch(() => undefined);
        // Write explicitly (the auth listener may have raced us with a default name).
        const profile: User = {
          uid: cred.user.uid,
          displayName: displayName.trim() || email.split('@')[0],
          email: email.trim(),
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', cred.user.uid), profile);
        setUser(profile);
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(auth, email.trim());
      },
      logout: async () => {
        setCurrentCampaign(null);
        await signOut(auth);
        // Don't leave the campaign in this browser's offline cache (shared table laptops).
        try {
          await terminate(db);
          await clearIndexedDbPersistence(db);
        } catch (err) {
          logError('Clearing offline cache', err);
        }
        window.location.reload();
      },
      currentCampaign,
      setCurrentCampaign,
      isDM,
      isOwner,
    }),
    [user, firebaseUser, authReady, restoringCampaign, currentCampaign, setCurrentCampaign, isDM, isOwner],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
