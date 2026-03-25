import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity } from '../types';
import { useAuth } from '../AuthContext';

export function useEntities() {
  const { currentCampaign, user, isDM } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentCampaign || !user) {
      setEntities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (isDM) {
      const q = query(
        collection(db, 'entities'),
        where('campaignId', '==', currentCampaign.id)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(data);
        setLoading(false);
      }, (err) => {
        console.error('Error fetching entities:', err);
        setError(err.message);
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      // For players, we use 3 separate queries to bypass Firestore's OR query limitations
      // with security rules. This ensures we don't get "Missing or insufficient permissions".
      const qPublic = query(
        collection(db, 'entities'),
        where('campaignId', '==', currentCampaign.id),
        where('isPublic', '==', true)
      );
      const qOwner = query(
        collection(db, 'entities'),
        where('campaignId', '==', currentCampaign.id),
        where('ownerId', '==', user.uid)
      );
      const qAllowed = query(
        collection(db, 'entities'),
        where('campaignId', '==', currentCampaign.id),
        where('allowedPlayers', 'array-contains', user.uid)
      );

      let publicEntities: Entity[] = [];
      let ownerEntities: Entity[] = [];
      let allowedEntities: Entity[] = [];

      let publicLoaded = false;
      let ownerLoaded = false;
      let allowedLoaded = false;

      const mergeAndSet = () => {
        if (publicLoaded && ownerLoaded && allowedLoaded) {
          const all = [...publicEntities, ...ownerEntities, ...allowedEntities];
          // Deduplicate by ID
          const unique = Array.from(new Map(all.map(e => [e.id, e])).values());
          setEntities(unique);
          setLoading(false);
        }
      };

      const unsubPublic = onSnapshot(qPublic, (snapshot) => {
        publicEntities = snapshot.docs.map(doc => doc.data() as Entity);
        publicLoaded = true;
        mergeAndSet();
      }, (err) => {
        console.error('Public query error:', err);
        setError('Failed to load public entities.');
      });

      const unsubOwner = onSnapshot(qOwner, (snapshot) => {
        ownerEntities = snapshot.docs.map(doc => doc.data() as Entity);
        ownerLoaded = true;
        mergeAndSet();
      }, (err) => {
        console.error('Owner query error:', err);
        setError('Failed to load your entities.');
      });

      const unsubAllowed = onSnapshot(qAllowed, (snapshot) => {
        allowedEntities = snapshot.docs.map(doc => doc.data() as Entity);
        allowedLoaded = true;
        mergeAndSet();
      }, (err) => {
        console.error('Allowed query error:', err);
        setError('Failed to load shared entities.');
      });

      return () => {
        unsubPublic();
        unsubOwner();
        unsubAllowed();
      };
    }
  }, [currentCampaign, user, isDM]);

  return { entities, loading, error };
}
