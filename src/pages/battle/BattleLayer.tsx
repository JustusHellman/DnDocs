import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ViewerApi } from '../../components/map/MapViewer';
import BattleBoard, { type DraftShape, type Ruler, type Tool } from '../../components/battle/BattleBoard';
import { blockingSegments, boardOf, FogMask, pointInPolygon, visibilityPolygon, type Board, type Pt } from '../../lib/battle/geometry';
import type { Drawing, LiveMark, Scene, SceneGrid, Token } from '../../types';

// ---------------------------------------------------------------------------
// The layer drawn over the map image (a component so its heavy maths is memoised).
// ---------------------------------------------------------------------------

export interface LayerProps {
  api: ViewerApi;
  scene: Scene;
  grid: SceneGrid;
  tokens: Token[];
  drawings: Drawing[];
  marks: LiveMark[];
  uid: string;
  asDM: boolean;
  tool: Tool;
  selectedId: string | null;
  targetId?: string | null;
  fogPaint: FogMask | null;
  showWalls: boolean;
  ruler: Ruler | null;
  draft: DraftShape | null;
  refs: { api: React.MutableRefObject<ViewerApi | null>; board: React.MutableRefObject<Board | null>; mask: React.MutableRefObject<FogMask | null> };
  thumbOf: (t: Token) => string | null;
  hpOf: (t: Token) => { cur: number; max: number; temp: number } | null;
  canMove: (t: Token) => boolean;
  canErase: (d: Drawing) => boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number, feet?: number) => void;
  onBlocked: (t: Token, x: number, y: number) => void;
  speedOf: (t: Token) => number | null;
  movedOf: (t: Token) => number;
  onOpen: (t: Token) => void;
  onDoor: (i: number) => void;
  onErase: (d: Drawing) => void;
  selectedDrawingId: string | null;
  onDrawingSelect?: (d: Drawing) => void;
  onDrawingShare?: (d: Drawing) => void;
  onDrawingMove?: (d: Drawing, dx: number, dy: number) => void;
  /** A token to spotlight (pointed at in the initiative list): the others dim. */
  spotlightId: string | null;
  onTokenHover: (id: string | null) => void;
  /** DM only: creatures the party has now seen get marked as known. */
  onDiscovered?: (ids: string[]) => void;
}

/** Whether any part of a token is at a point the test says is visible. */
function tokenIsSeen(t: Token, sees: (p: Pt) => boolean) {
  const c = { x: t.x + t.size / 2, y: t.y + t.size / 2 };
  const k = Math.max(0, t.size / 2 - 0.25);
  return [c, { x: c.x - k, y: c.y - k }, { x: c.x + k, y: c.y - k }, { x: c.x - k, y: c.y + k }, { x: c.x + k, y: c.y + k }].some(sees);
}

export default function BattleLayer(p: LayerProps) {
  const { api, scene, grid } = p;
  const board = useMemo(() => boardOf(grid, api.natural.w, api.natural.h), [grid.cols, grid.ox, grid.oy, api.natural.w, api.natural.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const fogMode = scene.fog?.mode ?? 'off';
  const stored = useMemo(() => {
    if (fogMode === 'off') return null;
    // A mask saved for another grid size doesn't fit any more: everything starts hidden again.
    if (scene.fog.cols !== board.cols || scene.fog.rows !== board.rows) return new FogMask(board.cols, board.rows);
    return FogMask.decode(scene.fog.revealed, board.cols, board.rows);
  }, [fogMode, scene.fog?.revealed, scene.fog?.cols, scene.fog?.rows, board.cols, board.rows]);
  const mask = p.fogPaint ?? stored;

  // Party vision: everything any player's token can see.
  const segs = useMemo(() => blockingSegments(scene.walls, scene.doors, scene.openDoors ?? []), [scene.walls, scene.doors, scene.openDoors]);
  // A hidden (e.g. invisible) character still sees, but only for its own player: the DM's screen
  // (which marks monsters as seen for everyone) and the other players leave it out.
  const seesForMe = (t: Token) => t.controlledBy.length > 0 && (!t.hidden || (!p.asDM && t.controlledBy.includes(p.uid)));
  const viewerKey = p.tokens
    .filter(seesForMe)
    .map((t) => `${t.x},${t.y},${t.size},${t.vision}`)
    .join('|');
  const visible = useMemo(() => {
    if (fogMode !== 'vision') return [];
    const bounds = { minX: board.left, minY: board.top, maxX: board.left + board.w, maxY: board.top + board.h };
    return p.tokens.filter(seesForMe).map((t) => visibilityPolygon({ x: t.x + t.size / 2, y: t.y + t.size / 2 }, segs, bounds, t.vision || 0));
  }, [fogMode, viewerKey, segs, board]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the party can see (the same for every player).
  const partySees = (pt: Pt) => {
    if (fogMode === 'off') return true;
    if (stored?.get(Math.floor(pt.x) - board.fx, Math.floor(pt.y) - board.fy)) return true;
    return fogMode === 'vision' && visible.some((poly) => pointInPolygon(pt, poly));
  };
  const seen = (pt: Pt) => {
    if (p.asDM || fogMode === 'off') return true;
    if (mask?.get(Math.floor(pt.x) - board.fx, Math.floor(pt.y) - board.fy)) return true;
    return fogMode === 'vision' && visible.some((poly) => pointInPolygon(pt, poly));
  };

  // DM's screen: a creature becomes known to the players once the party has seen it, or when it acts
  // (its turn comes up while it isn't hidden). One write per creature, ever.
  const asked = useRef(new Set<string>());
  const combat = scene.combat;
  // Worked out on every render (cheap: a few points per token), so any change in what the party
  // sees — a door opening, a token moving, fog being revealed — is picked up.
  const discovered = p.onDiscovered
    ? p.tokens
        .filter((t) => !t.known && !t.hidden && t.controlledBy.length === 0)
        .filter((t) => (combat?.active && combat.turn === t.id) || tokenIsSeen(t, partySees))
        .map((t) => t.id)
    : [];
  const discoveredKey = discovered.join(',');
  useEffect(() => {
    const ids = discovered.filter((id) => !asked.current.has(id));
    if (!ids.length || !p.onDiscovered) return;
    ids.forEach((id) => asked.current.add(id));
    p.onDiscovered(ids);
  }, [discoveredKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    p.refs.api.current = api;
    p.refs.board.current = board;
    p.refs.mask.current = stored;
  });

  return (
    <BattleBoard
      api={api}
      board={board}
      scene={{ ...scene, grid }}
      tokens={p.tokens}
      drawings={p.drawings}
      marks={p.marks}
      uid={p.uid}
      asDM={p.asDM}
      tool={p.tool}
      selectedId={p.selectedId}
      targetId={p.targetId}
      turnId={scene.combat?.active ? scene.combat.turn : null}
      fog={{ on: fogMode !== 'off', mask, visible }}
      showWalls={p.showWalls}
      ruler={p.ruler}
      draft={p.draft}
      thumbOf={p.thumbOf}
      hpOf={p.hpOf}
      canMove={p.canMove}
      canErase={p.canErase}
      seen={seen}
      onSelect={p.onSelect}
      onMove={p.onMove}
      onBlocked={p.onBlocked}
      speedOf={p.speedOf}
      movedOf={p.movedOf}
      onOpen={p.onOpen}
      onDoor={p.onDoor}
      onErase={p.onErase}
      selectedDrawingId={p.selectedDrawingId}
      onDrawingSelect={p.onDrawingSelect}
      onDrawingShare={p.onDrawingShare}
      onDrawingMove={p.onDrawingMove}
      spotlightId={p.spotlightId}
      onTokenHover={p.onTokenHover}
    />
  );
}
