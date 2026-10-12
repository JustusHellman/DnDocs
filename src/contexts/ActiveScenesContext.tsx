import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useActiveScenes } from '../hooks/useScene';
import type { Scene } from '../types';

type ActiveScene = Pick<Scene, 'id' | 'name' | 'combat'>;

const Ctx = createContext<ActiveScene[]>([]);

/** The battle maps the DM has switched on (one small listener for the whole app). */
export function ActiveScenesProvider({ children }: { children: ReactNode }) {
  const { currentCampaign } = useAuth();
  const onBattlePage = useLocation().pathname.startsWith('/battle/');
  const scenes = useActiveScenes(currentCampaign?.id, onBattlePage);
  return <Ctx.Provider value={scenes}>{children}</Ctx.Provider>;
}

export function useActiveBattles() {
  return useContext(Ctx);
}
