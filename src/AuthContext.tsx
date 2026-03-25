import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { User, Campaign, OperationType } from './types';
import { handleFirestoreError } from './utils/firebaseUtils';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  currentCampaign: Campaign | null;
  setCurrentCampaign: (campaign: Campaign | null) => void;
  isDM: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Persist current campaign to localStorage
  useEffect(() => {
    if (currentCampaign) {
      localStorage.setItem('currentCampaignId', currentCampaign.id);
    } else if (isAuthReady && !restoring) {
      // Only remove if we are actually ready and not currently trying to restore
      localStorage.removeItem('currentCampaignId');
    }
  }, [currentCampaign, isAuthReady, restoring]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        try {
          const userRef = doc(db, 'users', fUser.uid);
          const userSnap = await getDoc(userRef);
          
          let userData: User;
          if (!userSnap.exists()) {
            userData = {
              uid: fUser.uid,
              displayName: fUser.displayName || fUser.email?.split('@')[0] || 'Unknown Player',
              email: fUser.email || '',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, userData);
          } else {
            userData = userSnap.data() as User;
          }
          setUser(userData);

          // Restore campaign from localStorage
          const savedCampaignId = localStorage.getItem('currentCampaignId');
          if (savedCampaignId) {
            setRestoring(true);
            try {
              const campSnap = await getDoc(doc(db, 'campaigns', savedCampaignId));
              if (campSnap.exists()) {
                setCurrentCampaign(campSnap.data() as Campaign);
              }
            } catch (e) {
              console.error("Failed to restore campaign:", e);
            } finally {
              setRestoring(false);
            }
          }

          // Listen to user changes
          const unsubUser = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
              setUser(doc.data() as User);
            }
          }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fUser.uid}`));

          setIsAuthReady(true);
          setLoading(false);
          return () => unsubUser();
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${fUser.uid}`);
          setIsAuthReady(true);
          setLoading(false);
        }
      } else {
        setUser(null);
        setCurrentCampaign(null);
        setIsAuthReady(true);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Also listen to current campaign changes
  useEffect(() => {
    if (!currentCampaign?.id) return;
    const unsub = onSnapshot(doc(db, 'campaigns', currentCampaign.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentCampaign(docSnap.data() as Campaign);
      } else {
        setCurrentCampaign(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `campaigns/${currentCampaign.id}`));
    return () => unsub();
  }, [currentCampaign?.id]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error('Email login error:', error);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const userRef = doc(db, 'users', cred.user.uid);
      const newUser: User = {
        uid: cred.user.uid,
        displayName: displayName || email.split('@')[0],
        email: email,
        createdAt: new Date().toISOString(),
      };
      await setDoc(userRef, newUser);
    } catch (error) {
      console.error('Email registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isOwner = currentCampaign?.dmId === user?.uid;
  const isDM = isOwner || (currentCampaign?.coDms?.includes(user?.uid || '') ?? false);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, loginWithEmail, registerWithEmail, logout, currentCampaign, setCurrentCampaign, isDM, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
