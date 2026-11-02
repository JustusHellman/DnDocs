import { useSyncExternalStore } from 'react';
import { getDrawings, getSecret, getSnap, subscribe } from './sceneStore';
export function useScene() {
  const drawings = useSyncExternalStore(subscribe, getDrawings);
  const { scene, tokens } = useSyncExternalStore(subscribe, getSnap);
  const hp = useSyncExternalStore(subscribe, getSecret);
  return { scene, ready: true, tokens, tokensReady: true, drawings, marks: [], secret: { hp } } as never;
}
export const useActiveScenes = () => [] as never;
