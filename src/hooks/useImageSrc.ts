import { useEffect, useState } from 'react';
import { fetchMediaData, isMediaRef, mediaIdOf } from '../lib/media';

/** Resolves an image reference (`media:<id>`, data url or external url) to a displayable src. */
export function useImageSrc(ref: string | null | undefined) {
  const direct = ref && !isMediaRef(ref) ? ref : null;
  const [src, setSrc] = useState<string | null>(direct);
  const [loading, setLoading] = useState(!!ref && !direct);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!ref) {
      setSrc(null);
      setLoading(false);
      return;
    }
    if (!isMediaRef(ref)) {
      setSrc(ref);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMediaData(mediaIdOf(ref))
      .then((data) => {
        if (cancelled) return;
        setSrc(data);
        setFailed(!data);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ref]);

  return { src, loading, failed };
}
