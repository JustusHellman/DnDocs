/**
 * Which character the spellbook panel and the chat's commands (/cast, /use, /rest…) act for:
 * your own (you pick when you play several); the DM picks any character.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import type { Entity } from '../../types';
import { readDevice, writeDevice } from '../../lib/device';

const key = (cid: string, uid: string) => `dndocs-acting:${cid}:${uid}`;
let listeners = new Set<() => void>();

/**
 * Which character the chat's commands (/cast, /use, /rest…) act for: your own (you pick when you
 * play several); the DM picks any character.
 */
export function useActingCharacter() {
  const { user, currentCampaign, isDM } = useAuth();
  const { entities } = useCampaignData();
  const cid = currentCampaign?.id ?? '';
  const uid = user?.uid ?? '';
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const choices = useMemo(() => entities.filter((e) => e.type === 'character' && (isDM || e.playerId === uid)).sort((a, b) => a.name.localeCompare(b.name)), [entities, isDM, uid]);
  const saved = readDevice(key(cid, uid));
  void tick;
  const entity: Entity | null = choices.find((e) => e.id === saved) ?? (isDM ? null : (choices[0] ?? null));
  const setId = (id: string) => {
    writeDevice(key(cid, uid), id);
    listeners.forEach((f) => f());
  };
  return { entity, choices, setId };
}
// Hot reload keeps the set.
if (import.meta.hot) import.meta.hot.dispose(() => (listeners = new Set()));
