import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../firebase';
import type { Entity, Relationship, User } from '../types';
import { useAuth } from './AuthContext';
import { backfillCoverThumb, fetchUsers } from '../lib/entityService';
import { applyTypeConfig, normalizeEntity } from '../lib/entityTypes';
import {
  canDeleteEntity,
  canEditEntity,
  canViewEntity,
  canViewField,
  type Viewer,
} from '../lib/permissions';
import { logError } from '../lib/errors';

interface CampaignData {
  entities: Entity[];
  entityMap: Map<string, Entity>;
  /** parentId -> entities located there */
  childrenOf: Map<string, Entity[]>;
  relationships: Relationship[];
  /** Entries whose text links to the given entry ("Mentioned in"). */
  mentionedIn: (id: string) => Entity[];
  relationshipLabels: string[];
  members: User[];
  /** Members who are neither owner nor co-DM */
  players: User[];
  memberName: (uid: string | undefined) => string;
  loading: boolean;
  error: string | null;
  viewer: Viewer | null;
  canView: (e: Entity) => boolean;
  canViewField: (e: Entity, field: string) => boolean;
  canEdit: (e: Pick<Entity, 'type' | 'ownerId'>) => boolean;
  canDelete: (e: Pick<Entity, 'type' | 'ownerId'>) => boolean;
  refreshMembers: () => void;
}

const Ctx = createContext<CampaignData | undefined>(undefined);

/**
 * One set of Firestore listeners for the whole app. Previously every page / tab window opened
 * its own listeners (up to 3 per component for players), which was slow and costly.
 */
const backfilled = new Set<string>();

export function CampaignDataProvider({ children }: { children: ReactNode }) {
  const { currentCampaign, user, isDM } = useAuth();
  const campaignId = currentCampaign?.id;
  const uid = user?.uid;

  const [rawEntities, setEntities] = useState<Entity[]>([]);

  // The campaign's own entry types: update the shared registry before anything renders with it.
  const typesKey = JSON.stringify(currentCampaign?.typeConfig ?? null);
  useMemo(() => applyTypeConfig(currentCampaign?.typeConfig), [typesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const entities = useMemo(() => rawEntities.map(normalizeEntity), [rawEntities, typesKey]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [membersVersion, setMembersVersion] = useState(0);

  // Entities
  useEffect(() => {
    if (!campaignId || !uid) {
      setEntities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const col = collection(db, 'entities');
    const base = where('campaignId', '==', campaignId);

    // Players can only query what the security rules let them read, so we union three queries.
    const queries: Query[] = isDM
      ? [query(col, base)]
      : [
          query(col, base, where('isPublic', '==', true)),
          query(col, base, where('ownerId', '==', uid)),
          query(col, base, where('allowedPlayers', 'array-contains', uid)),
        ];

    const buckets: (Entity[] | null)[] = queries.map(() => null);
    const publish = () => {
      if (buckets.some((b) => b === null)) return;
      const merged = new Map<string, Entity>();
      buckets.forEach((b) => b!.forEach((e) => merged.set(e.id, e)));
      setEntities([...merged.values()]);
      setLoading(false);
    };

    const unsubs = queries.map((q, i) =>
      onSnapshot(
        q,
        (snap) => {
          buckets[i] = snap.docs.map((d) => d.data() as Entity);
          publish();
        },
        (err) => {
          logError('Entity listener', err);
          buckets[i] = buckets[i] ?? [];
          setError('Some entries could not be loaded. Check your connection.');
          publish();
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [campaignId, uid, isDM]);

  // Relationships (one listener for the whole campaign)
  useEffect(() => {
    if (!campaignId || !uid) {
      setRelationships([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'relationships'), where('campaignId', '==', campaignId)),
      (snap) => setRelationships(snap.docs.map((d) => d.data() as Relationship)),
      (err) => logError('Relationship listener', err),
    );
  }, [campaignId, uid]);

  // Older entries have images but no inline preview yet: the DM's client fills them in quietly,
  // one at a time, so lists can show pictures without loading full images.
  useEffect(() => {
    if (!isDM || loading) return;
    const todo = entities.filter((e) => e.coverThumb === undefined && e.imageUrls?.length).slice(0, 25);
    if (!todo.length) return;
    let cancelled = false;
    (async () => {
      for (const e of todo) {
        if (cancelled) return;
        if (backfilled.has(e.id)) continue;
        backfilled.add(e.id);
        await backfillCoverThumb(e).catch((err) => logError('Image preview', err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entities, isDM, loading]);

  // Members – fetched by id rather than listing the whole users collection.
  const memberKey = currentCampaign
    ? [currentCampaign.dmId, ...(currentCampaign.coDms ?? []), ...currentCampaign.players].join(',')
    : '';
  useEffect(() => {
    if (!memberKey) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    fetchUsers(memberKey.split(','))
      .then((users) => !cancelled && setMembers(users))
      .catch((err) => logError('Loading members', err));
    return () => {
      cancelled = true;
    };
  }, [memberKey, membersVersion]);

  const value = useMemo<CampaignData>(() => {
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    const childrenOf = new Map<string, Entity[]>();
    for (const e of entities) {
      if (!e.locationId) continue;
      const list = childrenOf.get(e.locationId);
      if (list) list.push(e);
      else childrenOf.set(e.locationId, [e]);
    }
    const dmIds = new Set([currentCampaign?.dmId, ...(currentCampaign?.coDms ?? [])]);
    const players = members.filter((m) => !dmIds.has(m.uid) && currentCampaign?.players.includes(m.uid));
    const viewer: Viewer | null = uid ? { uid, isDM } : null;
    const nameById = new Map(members.map((m) => [m.uid, m.displayName]));

    // Backlinks: scan the text each viewer can read for links to other entries.
    const backlinks = new Map<string, Entity[]>();
    const LINK = /\/entity\/([^)\s/?#]+)\)/g;
    for (const e of entities) {
      if (!canViewEntity(viewer, e)) continue;
      const parts = [canViewField(viewer, e, 'content') ? e.content : ''];
      if (isDM) parts.push(e.dmNotes ?? '');
      else if (uid) parts.push(e.playerKnowledge?.[uid] ?? '');
      const seen = new Set<string>();
      for (const m of parts.join('\n').matchAll(LINK)) {
        let target: string;
        try {
          target = decodeURIComponent(m[1]);
        } catch {
          continue; // malformed link text
        }
        if (target === e.id || seen.has(target)) continue;
        seen.add(target);
        const list = backlinks.get(target);
        if (list) list.push(e);
        else backlinks.set(target, [e]);
      }
    }

    return {
      entities,
      entityMap,
      childrenOf,
      relationships,
      mentionedIn: (id) => backlinks.get(id) ?? [],
      relationshipLabels: [...new Set(relationships.flatMap((r) => [r.label, r.reverseLabel ?? '']).filter(Boolean))].sort(),
      members,
      players,
      memberName: (id) => (id ? nameById.get(id) ?? 'Unknown' : 'Unknown'),
      loading,
      error,
      viewer,
      canView: (e) => canViewEntity(viewer, e),
      canViewField: (e, f) => canViewField(viewer, e, f),
      canEdit: (e) => canEditEntity(viewer, e),
      canDelete: (e) => canDeleteEntity(viewer, e),
      refreshMembers: () => setMembersVersion((v) => v + 1),
    };
  }, [entities, relationships, members, loading, error, uid, isDM, currentCampaign, typesKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCampaignData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCampaignData must be used inside CampaignDataProvider');
  return ctx;
}

/** Visible entities only, memoised. */
export function useVisibleEntities() {
  const { entities, canView } = useCampaignData();
  return useMemo(() => entities.filter(canView), [entities, canView]);
}

/** Walks up the location chain (with cycle protection). */
export function useAncestors(entity: Entity | null | undefined) {
  const { entityMap, canView } = useCampaignData();
  return useMemo(() => {
    const chain: Entity[] = [];
    const seen = new Set<string>();
    let cur = entity?.locationId ? entityMap.get(entity.locationId) : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (canView(cur)) chain.unshift(cur);
      cur = cur.locationId ? entityMap.get(cur.locationId) : undefined;
    }
    return chain;
  }, [entity, entityMap, canView]);
}

export function useIsDescendant() {
  const { entityMap } = useCampaignData();
  return useCallback(
    (entity: Entity, ancestorId: string) => {
      const seen = new Set<string>();
      let cur: Entity | undefined = entity;
      while (cur?.locationId && !seen.has(cur.id)) {
        if (cur.locationId === ancestorId) return true;
        seen.add(cur.id);
        cur = entityMap.get(cur.locationId);
      }
      return false;
    },
    [entityMap],
  );
}
