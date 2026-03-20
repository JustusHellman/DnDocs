import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { User, Campaign, OperationType } from './types';
import { handleFirestoreError } from './utils/firebaseUtils';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  currentCampaign: Campaign | null;
  setCurrentCampaign: (campaign: Campaign | null) => void;
  isDM: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        try {
          const userRef = doc(db, 'users', fUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            // Create new user
            const newUser: User = {
              uid: fUser.uid,
              displayName: fUser.displayName || 'Unknown Player',
              email: fUser.email || '',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, newUser);
            setUser(newUser);
          } else {
            setUser(userSnap.data() as User);
          }

          // Listen to user changes
          const unsubUser = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
              setUser(doc.data() as User);
            }
          }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fUser.uid}`));

          setLoading(false);
          return () => unsubUser();
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${fUser.uid}`);
          setLoading(false);
        }
      } else {
        setUser(null);
        setCurrentCampaign(null);
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
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isDM = currentCampaign?.dmId === user?.uid;

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, logout, currentCampaign, setCurrentCampaign, isDM }}>
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
