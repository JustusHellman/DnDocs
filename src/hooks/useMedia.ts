import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface Media {
  id: string;
  entityId: string;
  campaignId: string;
  data: string; // base64
  mimeType: string;
  ownerId: string;
  createdAt: string;
}

export function useMedia(mediaId: string | null | undefined) {
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setMedia(null);
      return;
    }

    async function fetchMedia() {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'media', mediaId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMedia({ id: docSnap.id, ...docSnap.data() } as Media);
        } else {
          setMedia(null);
        }
      } catch (err) {
        console.error('Error fetching media:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchMedia();
  }, [mediaId]);

  return { media, loading, error };
}
