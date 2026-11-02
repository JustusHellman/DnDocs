import { useMemo, useSyncExternalStore } from 'react';
import * as S from './state';
export function useCampaignData() {
  const entities = useSyncExternalStore(S.onEntities, () => S.entities);
  return useMemo(() => ({
    entities, entityMap: new Map(entities.map((e) => [e.id, e])), childrenOf: new Map(), relationships: [], mentionedIn: () => [], relationshipLabels: [],
    members: [S.DM, S.P1, S.P2], players: [S.P1, S.P2], memberName: (u?: string) => [S.DM, S.P1, S.P2].find((m) => m.uid === u)?.displayName ?? '',
    loading: false, error: null, viewer: null, canView: () => true, canViewField: () => true,
    canEdit: (e: { playerId?: string }) => S.AS_DM || e.playerId === S.ME.uid, canDelete: () => S.AS_DM, refreshMembers: () => {}, reloadFromServer: () => {},
  }), [entities]) as never;
}
export const useVisibleEntities = () => (useCampaignData() as unknown as { entities: unknown[] }).entities as never;
export const useAncestors = () => [];
export const useIsDescendant = () => () => false;
export function CampaignDataProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
