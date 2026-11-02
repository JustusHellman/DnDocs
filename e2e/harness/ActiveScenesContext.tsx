import { useSyncExternalStore } from 'react';
import { getSnap, subscribe } from './sceneStore';
export function ActiveScenesProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
/** The one harness scene, as a running battle. */
export function useActiveBattles() {
  const { scene } = useSyncExternalStore(subscribe, getSnap);
  return [{ ...scene, name: 'The Sunken Vault' }] as never;
}
