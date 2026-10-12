import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { drawingsCol, liveCol, sceneDoc, secretDoc, tokensCol } from '../lib/battle/sceneService';
import { logError } from '../lib/errors';
import type { Drawing, LiveMark, Scene, SceneSecret, Token } from '../types';
import { useAuth } from '../contexts/AuthContext';

export interface SceneState {
  scene: Scene | null;
  /** False until the scene document has answered (it may not exist yet). */
  ready: boolean;
  tokens: Token[];
  /** True once the token list has arrived (an empty list before that means "not loaded yet"). */
  tokensReady: boolean;
  drawings: Drawing[];
  /** Pings and shared measurements that arrived while the map was open. */
  marks: LiveMark[];
  secret: SceneSecret | null;
}

const MARK_MS = 4500;

/**
 * Live battle map data, only while the map is open. Players only ever receive tokens that
 * aren't hidden (the security rules refuse anything else).
 */
export function useScene(sceneId: string | undefined, campaignId: string | undefined, isDM: boolean): SceneState {
  const uid = useAuth().user?.uid;
  const [scene, setScene] = useState<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensReady, setTokensReady] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [marks, setMarks] = useState<LiveMark[]>([]);
  const [secret, setSecret] = useState<SceneSecret | null>(null);
  const exists = !!scene;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setReady(false);
    setScene(null);
    if (!sceneId) return;
    return onSnapshot(
      sceneDoc(sceneId),
      (snap) => {
        setScene(snap.exists() ? (snap.data() as Scene) : null);
        setReady(true);
      },
      (err) => {
        logError('Battle map listener', err);
        setScene(null);
        setReady(true);
      },
    );
  }, [sceneId]);

  // Sub-collections only once the scene exists (players can't read anything before that).
  useEffect(() => {
    setTokens([]);
    setTokensReady(false);
    setDrawings([]);
    setMarks([]);
    setSecret(null);
    if (!sceneId || !campaignId || !exists) return;
    const byCampaign = where('campaignId', '==', campaignId);
    // Players: every visible token, plus their own even while the DM has hidden it.
    const tokenQueries = isDM
      ? [query(tokensCol(sceneId), byCampaign)]
      : [query(tokensCol(sceneId), byCampaign, where('hidden', '==', false)), query(tokensCol(sceneId), byCampaign, where('controlledBy', 'array-contains', uid ?? ''))];
    const tokenSets: (Token[] | null)[] = tokenQueries.map(() => null);
    const unsubs = [
      ...tokenQueries.map((q, i) =>
        onSnapshot(
          q,
          (snap) => {
            tokenSets[i] = snap.docs.map((d) => d.data() as Token);
            if (tokenSets.some((x) => x === null)) return;
            const byId = new Map<string, Token>();
            tokenSets.forEach((list) => list!.forEach((t) => byId.set(t.id, t)));
            setTokens([...byId.values()]);
            setTokensReady(true);
          },
          (err) => logError('Token listener', err),
        ),
      ),
      onSnapshot(
        isDM ? query(drawingsCol(sceneId), byCampaign) : query(drawingsCol(sceneId), byCampaign, where('shared', '==', true)),
        (snap) => setDrawings(snap.docs.map((d) => d.data() as Drawing).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
        (err) => logError('Drawing listener', err),
      ),
    ];
    // Marks: only ones that change while we're watching (not old pings from before). Everything up
    // to the server's first answer is history; after that, whatever arrives is live (no clock
    // comparison, so a device with a wrong clock still sees pings).
    let live = false;
    unsubs.push(
      onSnapshot(
        query(liveCol(sceneId), byCampaign),
        { includeMetadataChanges: true },
        (snap) => {
          if (!live) {
            if (!snap.metadata.fromCache) live = true;
            return;
          }
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') continue;
            const m = ch.doc.data() as LiveMark;
            setMarks((list) => [...list.filter((x) => x.id !== m.id), m]);
            const t = timers.current.get(m.id);
            if (t) clearTimeout(t);
            timers.current.set(
              m.id,
              setTimeout(() => setMarks((list) => list.filter((x) => !(x.id === m.id && x.at === m.at))), MARK_MS),
            );
          }
        },
        (err) => logError('Ping listener', err),
      ),
    );
    if (isDM) {
      unsubs.push(
        onSnapshot(
          secretDoc(sceneId),
          (snap) => setSecret(snap.exists() ? (snap.data() as SceneSecret) : null),
          (err) => logError('DM battle notes listener', err),
        ),
      );
    }
    const pending = timers.current;
    return () => {
      unsubs.forEach((u) => u());
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, [sceneId, campaignId, isDM, exists, uid]);

  return { scene, ready, tokens, tokensReady, drawings, marks, secret };
}

/**
 * Battle maps the DM has switched on, for the "Join battle" banner. One tiny query per campaign.
 * Paused on a battle page: that page already listens to its scene, and every turn change would
 * otherwise be read twice.
 */
export function useActiveScenes(campaignId: string | undefined, paused = false) {
  const [scenes, setScenes] = useState<Pick<Scene, 'id' | 'name' | 'combat'>[]>([]);
  useEffect(() => {
    if (paused) return;
    setScenes([]);
    if (!campaignId) return;
    return onSnapshot(
      query(collection(db, 'scenes'), where('campaignId', '==', campaignId), where('active', '==', true)),
      (snap) => setScenes(snap.docs.map((d) => d.data() as Scene)),
      // Before the rules are deployed this is refused; the app simply shows no banner.
      () => setScenes([]),
    );
  }, [campaignId, paused]);
  return scenes;
}
