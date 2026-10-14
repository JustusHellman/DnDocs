import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../firebase';
import type { Entity, Relationship, User } from '../types';
import { useAuth } from './AuthContext';
import { backfillCoverThumb, fetchUsers } from '../lib/entityService';
import { applyTypeConfig, normalizeEntity } from '../lib/entityTypes';
import { bundlesQuery, linksFromBundles, migrateLinks, setLinksV2, sweepOldLinks } from '../lib/links';
import {
  canDeleteEntity,
  canEditEntity,
  canViewEntity,
  canViewField,
  type Viewer,
} from '../lib/permissions';
import { logError } from '../lib/errors';
import { CollectionSync } from '../lib/syncEngine';
import { pruneSyncHints } from '../lib/sync';
import { bulk } from '../lib/dbMeter';

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
  canEdit: (e: Pick<Entity, 'type' | 'ownerId' | 'playerId'>) => boolean;
  canDelete: (e: Pick<Entity, 'type' | 'ownerId' | 'playerId'>) => boolean;
  refreshMembers: () => void;
  /** Download the whole campaign again (ignores what this device has cached). */
  reloadFromServer: () => void;
}

const Ctx = createContext<CampaignData | undefined>(undefined);

/**
 * One set of Firestore listeners for the whole app. Previously every page / tab window opened
 * its own listeners (up to 3 per component for players), which was slow and costly.
 */
const backfilled = new Set<string>();

const PROFILE_TTL_MS = 24 * 3600_000;
const PROFILE_KEY = 'dndocs-profiles';
type ProfileCache = Record<string, { at: number; user: User }>;
function readProfileCache(): ProfileCache {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') as ProfileCache;
  } catch {
    return {};
  }
}
function writeProfileCache(c: ProfileCache) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

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

  // Entities and relationships: incremental sync (lib/syncEngine.ts) — a device that has the
  // campaign cached only downloads what changed since its last visit.
  const syncs = useRef<{ entities?: CollectionSync<Entity>; relationships?: CollectionSync<Relationship> }>({});
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
    const sync = new CollectionSync<Entity>({
      key: `entities:${campaignId}:${uid}:${isDM ? 'dm' : 'player'}`,
      campaignId,
      coll: 'entities',
      uid,
      isDM,
      queries,
      onData: (docs) => {
        setEntities(docs);
        setLoading(false);
      },
      onError: setError,
    });
    syncs.current.entities = sync;
    if (import.meta.env.DEV) ((window as unknown as { __sync?: Record<string, unknown> }).__sync ??= {}).entities = sync;
    sync.start();
    return () => {
      sync.stop();
      if (syncs.current.entities === sync) syncs.current.entities = undefined;
    };
  }, [campaignId, uid, isDM]);

  // Links: bundle documents (a few reads for the whole campaign) or, for campaigns not moved over
  // yet, one document per link with incremental sync.
  const linksV2 = !!currentCampaign?.linksV2;
  useEffect(() => {
    if (!campaignId || !uid) {
      setRelationships([]);
      return;
    }
    setLinksV2(campaignId, linksV2);
    if (linksV2) {
      return onSnapshot(
        bundlesQuery(campaignId),
        (snap) => setRelationships(linksFromBundles(snap.docs)),
        (err) => logError('Link listener', err),
      );
    }
    const sync = new CollectionSync<Relationship>({
      key: `relationships:${campaignId}:${uid}`,
      campaignId,
      coll: 'relationships',
      uid,
      isDM,
      queries: [query(collection(db, 'relationships'), where('campaignId', '==', campaignId))],
      onData: setRelationships,
      onError: (msg) => logError('Relationship listener', msg),
      // Deleting an entry deletes its links in the same go.
      dropsWith: (gone, r) => gone.coll === 'entities' && (r.sourceId === gone.docId || r.targetId === gone.docId),
    });
    syncs.current.relationships = sync;
    if (import.meta.env.DEV) ((window as unknown as { __sync?: Record<string, unknown> }).__sync ??= {}).relationships = sync;
    sync.start();
    return () => {
      sync.stop();
      if (syncs.current.relationships === sync) syncs.current.relationships = undefined;
    };
  }, [campaignId, uid, isDM, linksV2]);

  // The owner's device moves an older campaign's links into bundles, once. If the new security
  // rules aren't deployed yet the write is refused; it's tried again a day later.
  const isOwner = !!uid && currentCampaign?.dmId === uid;
  useEffect(() => {
    if (!campaignId || !isOwner || linksV2) return;
    const key = `dndocs-links-migrate:${campaignId}`;
    try {
      if (Date.now() - Number(localStorage.getItem(key) || 0) < 24 * 3600_000) return;
    } catch {
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        /* ignore */
      }
      bulk('moving links into bundles', () => migrateLinks(campaignId)).catch((err) => logError('Moving links into bundles', err));
    }, 5000);
    return () => clearTimeout(t);
  }, [campaignId, isOwner, linksV2]);

  // DMs, once per session: move any link a device still on the old storage wrote separately.
  useEffect(() => {
    if (!campaignId || !isDM || !linksV2) return;
    const t = setTimeout(() => sweepOldLinks(campaignId).catch((err) => logError('Tidying old links', err)), 8000);
    return () => clearTimeout(t);
  }, [campaignId, isDM, linksV2]);

  /** Forget the offline bookkeeping and download the campaign again. */
  const reloadFromServer = useCallback(() => {
    syncs.current.entities?.resync();
    syncs.current.relationships?.resync();
  }, []);

  // The DM's device clears out sync hints older than a week now and then (devices away longer
  // than that always reload in full).
  useEffect(() => {
    if (!isDM || !campaignId) return;
    const t = setTimeout(() => pruneSyncHints(campaignId, syncs.current.entities?.serverTimeSeen() ?? 0).catch((err) => logError('Tidying sync hints', err)), 30_000);
    return () => clearTimeout(t);
  }, [isDM, campaignId]);

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
    // Profiles change rarely: keep them for a day on this device and only fetch missing or old
    // ones (Members page refreshes them all).
    const uids = [...new Set(memberKey.split(',').filter(Boolean))];
    const cached = readProfileCache();
    const fresh = (u: string) => membersVersion === 0 && cached[u] && Date.now() - cached[u].at < PROFILE_TTL_MS;
    const have = uids.filter(fresh).map((u) => cached[u].user);
    const need = uids.filter((u) => !fresh(u));
    // Show what we have (even if old) while the rest loads, rather than an empty list.
    setMembers(uids.map((u) => cached[u]?.user).filter((u): u is User => !!u));
    if (!need.length) return;
    fetchUsers(need)
      .then((users) => {
        if (cancelled) return;
        const now = Date.now();
        for (const u of users) cached[u.uid] = { at: now, user: u };
        writeProfileCache(cached);
        setMembers([...have, ...users]);
      })
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
      reloadFromServer,
    };
  }, [entities, relationships, members, loading, error, uid, isDM, currentCampaign, typesKey, reloadFromServer]);

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
