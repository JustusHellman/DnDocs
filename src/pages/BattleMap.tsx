import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Box,
  Circle,
  Triangle,
  Undo2,
  BookOpen,
  Dices,
  Zap,
  EyeOff,
  CloudFog,
  Eraser,
  Eye,
  Locate,
  MapPin,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Ruler as RulerIcon,
  Settings2,
  Slash,
  Spline,
  Swords,
  UserPlus,
  X,
  Hammer,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { usePeek } from '../contexts/PeekContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useImageSrc } from '../hooks/useImageSrc';
import { useScene } from '../hooks/useScene';
import MapViewer, { type ToolPhase, type ViewerApi } from '../components/map/MapViewer';
import BattleBoard, { cellAt, tokenHold, type DraftShape, type Ruler, type Tool } from '../components/battle/BattleBoard';
import InitiativeTracker from '../components/battle/InitiativeTracker';
import { openTableChat } from '../components/chat/ChatDock';
import { openQuickBook } from '../components/play/QuickBook';
import TokenCard, { AURA_TIMER } from '../components/battle/TokenCard';
import AddTokens, { specForEntity, type TokenSpec } from '../components/battle/AddTokens';
import ScenePanel, { type PanelTab } from '../components/battle/ScenePanel';
import { EmptyState, Page, PlayerPreviewBanner, Spinner } from '../components/ui/bits';
import { Modal } from '../components/ui/Modal';
import EntityView from '../components/entity/EntityView';
import {
  blockingSegments,
  boardOf,
  distanceFeet,
  encodePoints,
  FogMask,
  parseUvtt,
  pointInPolygon,
  percentToCells,
  simplify,
  snapToCellCenter,
  snapTokenCorner,
  visibilityPolygon,
  type Board,
  type Pt,
  type UvttImport,
} from '../lib/battle/geometry';
import { applyMapToBattle, loadForgeMap } from '../lib/battle/forge';
import ForgeModal from '../components/battle/ForgeModal';
import HarvestModal from '../components/battle/HarvestModal';
import { GiKnapsack } from 'react-icons/gi';
import {
  addDrawing,
  addTokens,
  clearDrawings,
  clearTokens,
  createScene,
  deleteDrawing,
  moveDrawing,
  deleteScene,
  deleteToken,
  markKnown,
  restoreDrawing,
  restoreToken,
  shareDrawing,
  moveToken,
  newScene,
  sendLiveMark,
  setDoorOpen,
  patchToken,
  updateScene,
  updateToken,
  type NewToken,
} from '../lib/battle/sceneService';
import { INK_COLORS, spreadAround } from '../lib/battle/table';
import { readHp } from '../lib/hitPoints';
import { snapTemplate, templateLabel, type TemplateKind } from '../lib/battle/templates';
import { mapListens, setPickedToken, type CastArea } from '../lib/play/ui';
import type { Drawing, Entity, FogMode, LiveMark, Scene, SceneGrid, SceneSecret, Token } from '../types';
import { arrayRemove, deleteField } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// The layer drawn over the map image (a component so its heavy maths is memoised).
// ---------------------------------------------------------------------------

interface LayerProps {
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
  onMove: (id: string, x: number, y: number) => void;
  onBlocked: (t: Token, x: number, y: number) => void;
  speedOf: (t: Token) => number | null;
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

function BattleLayer(p: LayerProps) {
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
    return p.tokens
      .filter(seesForMe)
      .map((t) => visibilityPolygon({ x: t.x + t.size / 2, y: t.y + t.size / 2 }, segs, bounds, t.vision || 0));
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

// ---------------------------------------------------------------------------

function ToolButton({ active, label, onClick, children, disabled }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-40 [&>svg]:size-[1.1rem]',
        active ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800 hover:text-stone-50',
      )}
    >
      {children}
    </button>
  );
}

/** Pen thickness in squares. */
const PEN_SIZES = [
  { v: 0.05, label: 'Fine pen' },
  { v: 0.1, label: 'Normal pen' },
  { v: 0.2, label: 'Thick pen' },
  { v: 0.4, label: 'Marker' },
];
const PEN_KEY = 'dndocs-pen';
function savedPen() {
  try {
    const v = Number(localStorage.getItem(PEN_KEY));
    return PEN_SIZES.some((p) => p.v === v) ? v : 0.1;
  } catch {
    return 0.1;
  }
}

const DRAW_SHAPES: { kind: Drawing['kind']; label: string; icon: React.ElementType }[] = [
  { kind: 'free', label: 'Freehand', icon: Spline },
  { kind: 'line', label: 'Line', icon: Slash },
  { kind: 'rect', label: 'Rectangle', icon: RectangleHorizontal },
];
/** Spell areas: drag from the point of origin; they snap to the grid and show the squares they catch. */
const TEMPLATE_SHAPES: { kind: Drawing['kind']; label: string; icon: React.ElementType }[] = [
  { kind: 'circle', label: 'Sphere / radius', icon: Circle },
  { kind: 'cone', label: 'Cone', icon: Triangle },
  { kind: 'beam', label: 'Line area (5 or 10 ft wide)', icon: Zap },
  { kind: 'cube', label: 'Cube', icon: Box },
];
const TEMPLATES: string[] = TEMPLATE_SHAPES.map((t) => t.kind);

interface ViewProps {
  entity: Entity;
  /** Players may join a battle at a place that is secret to them (no link back to the entry then). */
  entryVisible: boolean;
  src: string;
  scene: Scene;
  isDraft: boolean;
  tokens: Token[];
  tokensReady: boolean;
  drawings: Drawing[];
  marks: LiveMark[];
  secret: SceneSecret | null;
  preview: boolean;
  setPreview: (v: boolean) => void;
}

function BattleView({ entity, entryVisible, src, scene, isDraft, tokens: allTokens, tokensReady, drawings, marks, secret, preview, setPreview }: ViewProps) {
  const { user, isDM } = useAuth();
  const { entityMap, canView, canViewField, canEdit, players, memberName } = useCampaignData();
  const { peek } = usePeek();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const uid = user!.uid;
  const asDM = isDM && !preview;

  const [tool, setTool] = useState<Tool>('select');
  const [drawKind, setDrawKind] = useState<Drawing['kind']>('free');
  const [ink, setInk] = useState(INK_COLORS[0]);
  const [pen, setPenState] = useState(savedPen);
  const setPen = (v: number) => {
    setPenState(v);
    try {
      localStorage.setItem(PEN_KEY, String(v));
    } catch {
      /* ignore */
    }
  };
  const [fogReveal, setFogReveal] = useState(true);
  const [fogSize, setFogSize] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The spellbook knows which token is picked (a creature the DM casts for starts its area there).
  useEffect(() => {
    const t = selectedId ? allTokens.find((x) => x.id === selectedId) : null;
    setPickedToken(t ? { id: t.id, name: t.name } : null);
    return () => setPickedToken(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drawingId, setDrawingId] = useState<string | null>(null);
  // DM: whether new drawings are shown to the players straight away (off: private notes on the map).
  const [drawShared, setDrawShared] = useState(false);
  const [armed, setArmed] = useState<TokenSpec | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(isDraft);
  const [panelTab, setPanelTab] = useState<PanelTab>('grid');
  const [gridDraft, setGridDraft] = useState<SceneGrid | null>(null);
  const [showWalls, setShowWalls] = useState(false);
  const [ruler, setRuler] = useState<Ruler | null>(null);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [fogPaint, setFogPaint] = useState<FogMask | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Pointing at a row in the initiative list spotlights that token; pointing at a token on the map
  // highlights its row.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [mapHoverId, setMapHoverId] = useState<string | null>(null);
  // The token card sits in the lower-left corner, unless the token you picked is there: then it
  // moves to the lower right, so it never covers the token you just tapped.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardRight, setCardRight] = useState(false);
  const [entryOpen, setEntryOpen] = useState<string | null>(null);
  // In full screen the side panel would open behind the map, so entries open in a dialog instead.
  const openEntry = (e: Entity) => (fullscreen ? setEntryOpen(e.id) : peek(e));

  const apiRef = useRef<ViewerApi | null>(null);
  const boardRef = useRef<Board | null>(null);
  const maskRef = useRef<FogMask | null>(null);
  const rulerRef = useRef<Ruler | null>(null);
  rulerRef.current = ruler;
  const draftRef = useRef<DraftShape | null>(null);
  draftRef.current = draft;
  const rulerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fogRef = useRef<FogMask | null>(null);
  const measuring = useRef(false);
  /** Click-to-click ruler: it follows the mouse until a double-click, Enter or Escape. */
  const clickRuler = useRef(false);
  const lastRulerDown = useRef<{ at: number; x: number; y: number } | null>(null);
  const removeWaypointRef = useRef<() => void>(() => undefined);
  const finishRulerRef = useRef<() => void>(() => undefined);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftOrigin = useRef<Pt | null>(null);
  const [beamWidth, setBeamWidth] = useState(1);
  // A spell's area to place (from a cast in the chat): its outline follows the pointer, a click
  // or tap puts it down, Escape cancels.
  const [casting, setCasting] = useState<CastArea | null>(null);
  const castingRef = useRef<CastArea | null>(null);
  castingRef.current = casting;

  // --- undo: each person's own recent changes, newest first (this device, this visit) ---
  type UndoEntry = { label: string; run: () => Promise<unknown> };
  const undoStack = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  /** `announce`: something bigger went away (a token, drawings): say so, with an Undo button. */
  const pushUndo = (label: string, run: () => Promise<unknown>, announce = false) => {
    const entry: UndoEntry = { label, run };
    undoStack.current.push(entry);
    if (undoStack.current.length > 40) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
    if (announce) toast.show(`${label} — done`, { action: { label: 'Undo', onClick: () => undo(entry) }, duration: 8000 });
  };
  /** The last action, or a particular one (from its banner) if it's still on the stack. */
  const undo = async (which?: UndoEntry) => {
    const i = which ? undoStack.current.lastIndexOf(which) : undoStack.current.length - 1;
    if (i < 0) return;
    const [entry] = undoStack.current.splice(i, 1);
    setUndoCount(undoStack.current.length);
    if (!entry) return;
    try {
      await entry.run();
      toast.show(`Undone: ${entry.label}`);
    } catch (err) {
      toast.error(err, `Undo ${entry.label.toLowerCase()}`);
    }
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;

  // Ruler turning points. Dragging: right-click (left button still held) or Space / W adds one.
  // Click-to-click: right-click or Backspace takes the last one back, Enter finishes.
  useEffect(() => {
    if (tool !== 'measure') return;
    const onDown = (e: MouseEvent) => {
      if (e.button === 2 && measuring.current) {
        e.preventDefault();
        if (clickRuler.current) removeWaypointRef.current();
        else addWaypointRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!measuring.current) return;
      if (e.key === ' ' || e.key === 'w') {
        e.preventDefault();
        addWaypointRef.current();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        removeWaypointRef.current();
      } else if (e.key === 'Enter' && clickRuler.current) {
        e.preventDefault();
        finishRulerRef.current();
      }
    };
    const noMenu = (e: MouseEvent) => measuring.current && e.preventDefault();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', noMenu, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', noMenu, true);
    };
  }, [tool]);
  const addWaypointRef = useRef<() => void>(() => undefined);

  const grid = gridDraft ?? scene.grid;

  // The DM's screen keeps the battle map's copy of the map image and name in step with the entry.
  useEffect(() => {
    if (!isDM || isDraft) return;
    const patch: Record<string, unknown> = {};
    if (entity.mapConfig?.mediaId && entity.mapConfig.mediaId !== scene.mediaId) patch.mediaId = entity.mapConfig.mediaId;
    if (entity.name && entity.name !== scene.name) patch.name = entity.name;
    if (Object.keys(patch).length) updateScene(scene.id, patch).catch(() => undefined);
  }, [isDM, isDraft, entity.mapConfig?.mediaId, entity.name, scene.mediaId, scene.name, scene.id]);
  // The DM's "player view" shows exactly what players get.
  // Players never get hidden tokens, except their own (shown faded, still theirs to move).
  const tokens = useMemo(() => (asDM ? allTokens : allTokens.filter((t) => !t.hidden || t.controlledBy.includes(uid))), [allTokens, asDM, uid]);
  const selected = tokens.find((t) => t.id === selectedId) ?? null;
  useLayoutEffect(() => {
    const card = cardRef.current;
    const area = card?.offsetParent?.getBoundingClientRect();
    const el = selected ? document.querySelector(`[data-token="${CSS.escape(selected.id)}"]`) : null;
    if (!card || !area || !el || window.innerWidth < 640) return setCardRight(false);
    const t = el.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    const margin = 24;
    const underLeft = cx < area.left + 8 + card.offsetWidth + margin && cy > area.bottom - 8 - card.offsetHeight - margin;
    setCardRight(underLeft);
  }, [selected?.id, selected?.x, selected?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const fogOn = (scene.fog?.mode ?? 'off') !== 'off';

  useEffect(() => {
    if (selectedId && !tokens.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tokens, selectedId]);
  useEffect(() => {
    if (tool === 'fog' && (!asDM || !fogOn)) setTool('select');
  }, [tool, asDM, fogOn]);

  // Timed conditions run out at the start of the turn they were set on, N rounds later. The DM's
  // screen removes them (one write per token that has something ending).
  const expiryKey = scene.combat?.active ? `${scene.combat.round}:${scene.combat.turn}` : '';
  useEffect(() => {
    const c = scene.combat;
    if (!isDM || !c?.active || !c.turn) return;
    const order = c.order ?? [];
    const at = (id: string | null) => (id ? Math.max(0, order.indexOf(id)) : 0);
    const now = at(c.turn);
    for (const t of allTokens) {
      const ended = Object.entries(t.timers ?? {})
        .filter(([, tm]) => c.round > tm.round || (c.round === tm.round && now >= at(tm.turn)))
        .map(([name]) => name);
      if (!ended.length) continue;
      // The aura ends on its own timer, or with the concentration it came from.
      const auraEnds = !!t.aura && (ended.includes(AURA_TIMER) || (ended.includes('Concentrating') && !!t.aura.conc));
      const gone = [...ended, ...(auraEnds ? [AURA_TIMER] : [])];
      const conditionsEnded = ended.filter((n) => n !== AURA_TIMER);
      const names = [...conditionsEnded, ...(auraEnds ? ['aura'] : [])];
      // Only these conditions and timers: anything added meanwhile stays.
      const data: Record<string, unknown> = Object.fromEntries(gone.map((n) => [`timers.${n}`, deleteField()]));
      if (conditionsEnded.length) data.conditions = arrayRemove(...conditionsEnded);
      if (auraEnds) data.aura = null;
      patchToken(scene.id, t.id, data)
        .then(() => names.length && toast.show(`${t.name}: ${names.join(', ')} ended`))
        .catch(() => undefined);
    }
  }, [expiryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Your turn" for the player whose token is up.
  const turn = scene.combat?.active ? scene.combat.turn : null;
  const lastTurn = useRef<string | null>(null);
  useEffect(() => {
    if (turn && turn !== lastTurn.current) {
      const t = tokens.find((x) => x.id === turn);
      if (t && t.controlledBy.includes(uid) && !asDM) toast.show(`Your turn: ${t.name}`);
    }
    lastTurn.current = turn;
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, what: string) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      toast.error(err, what);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // --- helpers for the board ----------------------------------------------------
  const entityOf = (t: Token) => (t.entityId ? entityMap.get(t.entityId) : undefined);
  /** Walking speed from the stat block ("30 ft., fly 60 ft." → 30), shown when dragging. */
  const speedOf = (t: Token) => {
    const e = entityOf(t);
    if (!e || !(asDM || canViewField(e, 'statBlock'))) return null;
    const m = /(\d+)\s*ft/i.exec(e.dndStats?.speed ?? '');
    return m ? Number(m[1]) : null;
  };
  const thumbOf = (t: Token) => {
    const e = entityOf(t);
    // The entry's current picture when the viewer can see it, else the copy on the token
    // (so players see a monster's picture without seeing its entry).
    if (e && canView(e) && canViewField(e, 'imageUrls') && e.coverThumb) return e.coverThumb;
    return t.img ?? null;
  };
  const hpOf = (t: Token) => {
    const e = entityOf(t);
    if (e?.type === 'character' && canView(e) && canViewField(e, 'currentHp')) {
      const hp = readHp(e.attributes, canViewField(e, 'statBlock') ? e.dndStats?.hitPoints : undefined);
      return hp.max && hp.current !== null ? { cur: hp.current, max: hp.max, temp: hp.temp } : null;
    }
    const s = asDM ? secret?.hp?.[t.id] : undefined;
    return s && s.max > 0 ? { cur: s.cur, max: s.max, temp: 0 } : null;
  };
  const canMove = (t: Token) => !isDraft && (asDM || t.controlledBy.includes(uid));
  const canErase = (d: Drawing) => asDM || d.by === uid;

  // --- tools ------------------------------------------------------------------------
  const share = (mark: Parameters<typeof sendLiveMark>[3]) => user && sendLiveMark(scene.id, user, scene.campaignId, mark).catch((err) => toast.error(err, 'Share on the map'));

  /** Click-to-click ruler: the end follows the mouse. */
  const onRulerHover = (cx: number, cy: number) => {
    if (!clickRuler.current || !measuring.current) return;
    const api = apiRef.current;
    const board = boardRef.current;
    if (!api || !board) return;
    const p = cellAt(api, board, cx, cy);
    const q = grid.snap ? snapToCellCenter(p) : p;
    setRuler((r) => {
      if (!r) return r;
      const last = r.pts[r.pts.length - 1];
      if (last.x === q.x && last.y === q.y) return r;
      const pts = [...r.pts.slice(0, -1), q];
      return { pts, label: rulerLabel(pts) };
    });
  };
  /** Ruler total: each leg by the table's diagonal rule. */
  const rulerLabel = (pts: Pt[]) => {
    let ft = 0;
    for (let i = 1; i < pts.length; i++) ft += distanceFeet(pts[i - 1], pts[i], grid);
    return `${ft} ft`;
  };
  /** Pin the ruler's current end as a waypoint and carry on measuring from there. */
  addWaypointRef.current = () => addWaypoint();
  removeWaypointRef.current = () => removeWaypoint();
  finishRulerRef.current = () => finishRuler();
  /** Take back the last turning point (or the whole ruler when there is none). */
  const removeWaypoint = () => {
    const r = rulerRef.current;
    if (!r || !measuring.current) return;
    if (r.pts.length <= 2) {
      measuring.current = false;
      clickRuler.current = false;
      setRuler(null);
      return;
    }
    const pts = [...r.pts.slice(0, -2), r.pts[r.pts.length - 1]];
    setRuler({ pts, label: rulerLabel(pts) });
  };
  /** Done measuring: the ruler stays a few seconds (and players share it with the table). */
  const finishRuler = () => {
    const r = rulerRef.current;
    measuring.current = false;
    clickRuler.current = false;
    if (!r) return;
    // A double click leaves the same point twice: drop repeats.
    const pts = r.pts.filter((p, i) => i === 0 || p.x !== r.pts[i - 1].x || p.y !== r.pts[i - 1].y);
    if (pts.length < 2) return setRuler(null);
    const done = { pts, label: rulerLabel(pts) };
    setRuler(done);
    const a = pts[0];
    const b = pts[pts.length - 1];
    // Players' rulers are shared with the table. The DM's stay private: a line between hidden
    // monsters would give them away (the DM can ping to point at something).
    if (!isDM) share({ kind: 'measure', x: a.x, y: a.y, x2: b.x, y2: b.y, label: done.label, pts: pts.length > 2 ? encodePoints(pts) : undefined });
    rulerTimer.current = setTimeout(() => setRuler(null), 5000);
  };
  const addWaypoint = () =>
    setRuler((r) => {
      if (!r || !measuring.current) return r;
      const last = r.pts[r.pts.length - 1];
      const prev = r.pts[r.pts.length - 2];
      if (prev && prev.x === last.x && prev.y === last.y) return r;
      return { ...r, pts: [...r.pts, last] };
    });

  // Grid settings open: dragging the map slides the grid over it (saved with the rest of the grid).
  const gridDrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const gridDragOn = asDM && panelOpen && panelTab === 'grid';
  const onGridDrag = (phase: ToolPhase, cx: number, cy: number) => {
    const api = apiRef.current;
    const board = boardRef.current;
    if (!api || !board) return;
    const p = api.toPercent(cx, cy);
    if (phase === 'down') gridDrag.current = { x: p.x, y: p.y, ox: grid.ox, oy: grid.oy };
    const d = gridDrag.current;
    if (!d) return;
    if (phase === 'move' || phase === 'up') {
      const wrap = (v: number) => Math.round((((v % 1) + 1) % 1) * 100) / 100 % 1;
      const ox = wrap(d.ox + ((p.x - d.x) / 100) * board.w);
      const oy = wrap(d.oy + ((p.y - d.y) / 100) * board.h);
      if (ox !== grid.ox || oy !== grid.oy) setGridDraft({ ...grid, ox, oy });
    }
    if (phase === 'up' || phase === 'cancel') gridDrag.current = null;
  };

  const onTool = (phase: ToolPhase, cx: number, cy: number, pointerType = 'mouse') => {
    const api = apiRef.current;
    const board = boardRef.current;
    if (!api || !board) return;
    const p = cellAt(api, board, cx, cy);
    if (tool === 'measure') {
      // Two ways to measure: hold and drag (right-click or Space for a turning point), or click
      // once and the ruler follows the mouse: each click turns, right-click takes the last turn
      // back, a double-click or Enter finishes, Escape cancels.
      const q = grid.snap ? snapToCellCenter(p) : p;
      clearTimeout(rulerTimer.current);
      clearTimeout(dwellTimer.current);
      if (phase === 'down') {
        const now = Date.now();
        const prevDown = lastRulerDown.current;
        lastRulerDown.current = { at: now, x: cx, y: cy };
        if (clickRuler.current) {
          if (prevDown && now - prevDown.at < 400 && Math.hypot(cx - prevDown.x, cy - prevDown.y) < 8) finishRuler();
          else
            setRuler((r) => {
              if (!r) return r;
              const pts = [...r.pts.slice(0, -1), q, q];
              return { pts, label: rulerLabel(pts) };
            });
          return;
        }
        measuring.current = true;
        setRuler({ pts: [q, q], label: '0 ft' });
      } else if (phase === 'move') {
        setRuler((r) => {
          if (!r) return r;
          const pts = [...r.pts.slice(0, -1), q];
          return { pts, label: rulerLabel(pts) };
        });
        // Touch screens (fingers and pens) have no right click: holding still for a moment drops a waypoint.
        if (pointerType !== 'mouse') dwellTimer.current = setTimeout(addWaypoint, 650);
      } else if (phase === 'up') {
        if (clickRuler.current) return;
        const r = rulerRef.current;
        const a = r?.pts[0];
        const b = r?.pts[r.pts.length - 1];
        // A click without dragging (mouse): start a click-to-click ruler that follows the mouse.
        if (r && a && b && pointerType === 'mouse' && r.pts.length === 2 && a.x === b.x && a.y === b.y) {
          clickRuler.current = true;
          return;
        }
        finishRuler();
      } else {
        measuring.current = false;
        clickRuler.current = false;
        setRuler(null);
      }
      return;
    }
    if (tool === 'ping') {
      if (phase === 'up') share({ kind: 'ping', x: p.x, y: p.y });
      return;
    }
    if (tool === 'draw') {
      const d = draftRef.current;
      const template = TEMPLATES.includes(drawKind);
      if (phase === 'down') setDraft({ kind: drawKind, color: ink, points: [p, p], width: drawKind === 'beam' ? beamWidth : undefined, thick: template ? undefined : pen });
      else if (phase === 'move' && d) {
        setDraft((cur) => {
          if (!cur) return cur;
          if (cur.kind === 'free') {
            const last = cur.points[cur.points.length - 1];
            return Math.hypot(p.x - last.x, p.y - last.y) < 0.04 ? cur : { ...cur, points: [...cur.points, p] };
          }
          const a0 = cur.points[0];
          if (template) {
            const raw = draftOrigin.current ?? a0;
            draftOrigin.current = raw;
            const snapped = grid.snap ? snapTemplate(cur.kind as TemplateKind, raw, p) : { a: raw, b: p };
            return { ...cur, points: [snapped.a, snapped.b], label: templateLabel(cur.kind as TemplateKind, snapped.a, snapped.b, grid.feet) };
          }
          const label =
            cur.kind === 'line'
              ? `${distanceFeet(a0, p, grid)} ft`
              : `${Math.round(Math.abs(p.x - a0.x)) * grid.feet} × ${Math.round(Math.abs(p.y - a0.y)) * grid.feet} ft`;
          return { ...cur, points: [a0, p], label };
        });
      } else if (phase === 'up' && d) {
        draftOrigin.current = null;
        const pts = d.kind === 'free' ? simplify(d.points).slice(0, 600) : d.points;
        const size = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
        if (size > 0.1 || (d.kind === 'free' && pts.length > 2)) {
          // The shape shows at once (the listener has it before the server confirms), so the draft
          // goes now: waiting for the server would wipe a quick second stroke.
          const { drawing, saved } = addDrawing(scene.id, { campaignId: scene.campaignId, by: uid, kind: d.kind, color: d.color, points: encodePoints(pts), width: d.width, thick: d.thick, shared: isDM ? drawShared : true });
          pushUndo(template ? 'Spell area' : 'Drawing', () => deleteDrawing(scene.id, drawing.id));
          saved.catch((err) => toast.error(err, 'Save drawing'));
        }
        setDraft(null);
      } else if (phase === 'cancel') {
        draftOrigin.current = null;
        setDraft(null);
      }
      return;
    }
    if (tool === 'fog' && asDM) {
      const at = { x: p.x - board.fx, y: p.y - board.fy };
      if (phase === 'down') {
        fogRef.current = (maskRef.current ?? new FogMask(board.cols, board.rows)).clone();
        fogRef.current.paint(at, fogSize / 2 + 0.2, fogReveal);
        setFogPaint(fogRef.current.clone());
      } else if (phase === 'move' && fogRef.current) {
        fogRef.current.paint(at, fogSize / 2 + 0.2, fogReveal);
        setFogPaint(fogRef.current.clone());
      } else if (phase === 'up' && fogRef.current) {
        // One write per brush stroke.
        const m = fogRef.current;
        fogRef.current = null;
        const before = { 'fog.revealed': scene.fog.revealed, 'fog.cols': scene.fog.cols, 'fog.rows': scene.fog.rows };
        pushUndo(fogReveal ? 'Fog revealed' : 'Fog hidden', () => updateScene(scene.id, before));
        updateScene(scene.id, { 'fog.revealed': m.encode(), 'fog.cols': board.cols, 'fog.rows': board.rows })
          .catch((err) => toast.error(err, 'Save fog'))
          // Not while the next stroke is already being painted (its preview would flicker away).
          .finally(() => !fogRef.current && setFogPaint(null));
      } else {
        fogRef.current = null;
        setFogPaint(null);
      }
    }
  };

  useEffect(() => {
    if (isDraft) return;
    const stop = mapListens();
    const on = (e: Event) => {
      setTool('select');
      setArmed(null);
      setCasting((e as CustomEvent<CastArea>).detail);
    };
    window.addEventListener('dndocs:cast-area', on);
    return () => {
      stop();
      window.removeEventListener('dndocs:cast-area', on);
    };
  }, [isDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The area's outline for the pointer at `p` (squares): from the caster when the spell starts there. */
  const castShape = (c: CastArea, p: Pt): DraftShape => {
    const feet = grid.feet || 5;
    const n = c.area.f / feet;
    const kind: TemplateKind = c.area.k === 'cone' ? 'cone' : c.area.k === 'line' ? 'beam' : c.area.k === 'cube' ? 'cube' : 'circle';
    const caster = c.fromEntity ? allTokens.find((t) => t.entityId === c.fromEntity) : c.fromSelected && selectedId ? allTokens.find((t) => t.id === selectedId) : undefined;
    const color = c.color ?? INK_COLORS[3];
    const shape = (a: Pt, b: Pt, width?: number): DraftShape => ({ kind, color, points: [a, b], width, label: `${c.spell} · ${templateLabel(kind, a, b, feet)}` });
    if (caster) {
      const h = caster.size / 2;
      const o = { x: caster.x + h, y: caster.y + h };
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      if (kind === 'circle') return shape(o, { x: o.x + n + h, y: o.y });
      if (kind === 'cube') {
        // A cube with one face against the caster, on the side the pointer is.
        if (Math.abs(dx) >= Math.abs(dy)) {
          const sx = Math.sign(dx) || 1;
          const a = { x: o.x + sx * h, y: o.y - n / 2 };
          return shape(a, { x: a.x + sx * n, y: a.y + n });
        }
        const sy = Math.sign(dy) || 1;
        const a = { x: o.x - n / 2, y: o.y + sy * h };
        return shape(a, { x: a.x + n, y: a.y + sy * n });
      }
      // Cones and lines leave from the edge of the caster's space, towards the pointer.
      const a = { x: o.x + ux * h, y: o.y + uy * h };
      return shape(a, { x: a.x + ux * n, y: a.y + uy * n }, kind === 'beam' ? (c.area.w ?? 5) / feet : undefined);
    }
    if (kind === 'circle') {
      const a = grid.snap ? { x: Math.round(p.x), y: Math.round(p.y) } : p;
      return shape(a, { x: a.x + n, y: a.y });
    }
    if (kind === 'cube') {
      const a = grid.snap ? { x: Math.round(p.x - n / 2), y: Math.round(p.y - n / 2) } : { x: p.x - n / 2, y: p.y - n / 2 };
      return shape(a, { x: a.x + n, y: a.y + n });
    }
    return shape(p, { x: p.x + n, y: p.y }, kind === 'beam' ? (c.area.w ?? 5) / feet : undefined);
  };
  const onCastHover = (cx: number, cy: number) => {
    const api = apiRef.current;
    const board = boardRef.current;
    const c = castingRef.current;
    if (!api || !board || !c) return;
    setDraft(castShape(c, cellAt(api, board, cx, cy)));
  };
  const onCastTool = (phase: ToolPhase, cx: number, cy: number) => {
    const api = apiRef.current;
    const board = boardRef.current;
    const c = castingRef.current;
    if (!api || !board || !c) return;
    const d = castShape(c, cellAt(api, board, cx, cy));
    if (phase === 'down' || phase === 'move') setDraft(d);
    else if (phase === 'up') {
      const { drawing, saved } = addDrawing(scene.id, { campaignId: scene.campaignId, by: uid, kind: d.kind, color: d.color, points: encodePoints(d.points), width: d.width, shared: true });
      pushUndo(`${c.spell} area`, () => deleteDrawing(scene.id, drawing.id));
      saved.catch((err) => toast.error(err, 'Save spell area'));
      setDraft(null);
      setCasting(null);
    }
  };

  const placeArmed = (xPct: number, yPct: number) => {
    const board = boardRef.current;
    if (!armed || !board) return;
    const spec = armed;
    setArmed(null);
    const at = percentToCells(board, xPct, yPct);
    const spots = spreadAround(at.x, at.y, spec.count, spec.size);
    // Number on from creatures of the same name already on the map (a second wave of wolves starts at 6).
    const base = spec.name.slice(0, 100);
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const same = allTokens.filter((t) => t.name === base || new RegExp(`^${esc} \\d+$`).test(t.name));
    const last = Math.max(same.length ? 1 : 0, ...same.map((t) => Number(t.name.slice(base.length + 1)) || 0));
    const numbered = spec.count > 1 || same.length > 0;
    const list: NewToken[] = spots.map((pos, i) => {
      const c = snapTokenCorner(pos, spec.size, grid.snap);
      return {
        campaignId: scene.campaignId,
        name: numbered ? `${base} ${last + i + 1}` : spec.name.slice(0, 110),
        x: c.x,
        y: c.y,
        size: spec.size,
        color: spec.color,
        entityId: spec.entityId,
        codexRef: spec.codexRef ?? null,
        controlledBy: spec.controlledBy,
        hidden: spec.hidden,
        conditions: [],
        initiative: null,
        vision: 0,
        health: spec.hpMax ? 'healthy' : null,
        img: spec.img ?? null,
        // The party's own tokens are known from the start; monsters once they're seen or act.
        known: spec.controlledBy.length > 0,
      };
    });
    const hp = asDM && spec.hpMax ? Object.fromEntries(list.map((_, i) => [i, { cur: spec.hpMax!, max: spec.hpMax! }])) : undefined;
    run(async () => {
      const ids = await addTokens(scene.id, list, hp);
      pushUndo(spec.count > 1 ? `Placing ${spec.count} × ${spec.name}` : `Placing ${spec.name}`, () => Promise.all(ids.map((id) => deleteToken(scene.id, id, isDM))));
    }, 'Add tokens');
  };

  // Whether you play a character here at all (the spellbook button).
  const myCharacterAny = useMemo(() => [...entityMap.values()].some((e) => e.type === 'character' && e.playerId === uid), [entityMap, uid]);
  // A player's own character, if it isn't on the map yet.
  const myCharacter = useMemo(() => {
    if (isDM) return null;
    const onMap = new Set(allTokens.map((t) => t.entityId));
    return [...entityMap.values()].find((e) => e.type === 'character' && e.playerId === uid && !onMap.has(e.id)) ?? null;
  }, [isDM, allTokens, entityMap, uid]);

  // Anything half-done (a ruler, a shape being drawn, a fog stroke) ends when the tool changes or
  // on Escape, so nothing is left stuck on the map.
  const stopGestures = () => {
    measuring.current = false;
    clickRuler.current = false;
    clearTimeout(rulerTimer.current);
    clearTimeout(dwellTimer.current);
    setRuler(null);
    draftOrigin.current = null;
    setDraft(null);
    fogRef.current = null;
    setFogPaint(null);
  };
  useEffect(() => {
    stopGestures();
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: tool shortcuts and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' && !isDraft) {
        openTableChat({ dice: true, toggle: true });
        return;
      }
      const keys: Record<string, Tool> = { v: 'select', m: 'measure', d: 'draw', p: 'ping', e: 'erase', f: 'fog' };
      if (e.key === 'Escape') {
        setCasting(null);
        setArmed(null);
        setSelectedId(null);
        stopGestures();
        setTool('select');
      } else if (keys[e.key] && !isDraft && (keys[e.key] !== 'fog' || (asDM && fogOn))) setTool(keys[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDraft, asDM, fogOn]);

  // --- DM actions -------------------------------------------------------------------
  const create = () => run(() => createScene({ ...newScene(entity, grid) }), 'Create battle map').then((ok) => ok && (setGridDraft(null), setPanelOpen(false)));
  const saveGrid = async () => {
    if (!gridDraft) return;
    // A different grid means different squares: fog painted by hand starts over.
    const squaresChange = gridDraft.cols !== scene.grid.cols || gridDraft.ox !== scene.grid.ox || gridDraft.oy !== scene.grid.oy;
    if (squaresChange && scene.fog.mode === 'manual' && scene.fog.revealed) {
      const ok = await confirm({ title: 'Change the grid?', message: 'The fog you painted by hand is cleared and the whole map is hidden again.', confirmLabel: 'Change grid' });
      if (!ok) return;
    }
    run(() => updateScene(scene.id, { grid: gridDraft }), 'Save grid').then((ok) => ok && setGridDraft(null));
  };
  const setFogMode = (mode: FogMode) => run(() => updateScene(scene.id, { 'fog.mode': mode }), 'Fog');
  const fogAll = (reveal: boolean) => {
    const board = boardRef.current;
    if (!board) return;
    const m = new FogMask(board.cols, board.rows);
    m.fill(reveal);
    const before = { 'fog.revealed': scene.fog.revealed, 'fog.cols': scene.fog.cols, 'fog.rows': scene.fog.rows };
    pushUndo(reveal ? 'Fog: everything revealed' : 'Fog: everything hidden', () => updateScene(scene.id, before), true);
    run(() => updateScene(scene.id, { 'fog.revealed': m.encode(), 'fog.cols': board.cols, 'fog.rows': board.rows }), 'Fog');
  };
  const importFile = async (file: File) => {
    if (!user) return;
    if (file.size > 60_000_000) {
      toast.show('That file is too large to import.', { kind: 'error' });
      return;
    }
    setImporting(true);
    try {
      const uvtt = parseUvtt(await file.text());
      await applyMapToBattle({ entity, scene: isDraft ? null : scene, uvtt, user, grid });
      setGridDraft(null);
      setPanelOpen(isDraft ? false : panelOpen);
      toast.success(`Imported ${uvtt.cols} × ${uvtt.rows} squares, ${uvtt.walls.length / 4} walls and ${uvtt.doors.length / 4} doors`);
    } catch (err) {
      toast.error(err, 'Import map');
    } finally {
      setImporting(false);
    }
  };
  // Battlemap Forge: a new map, or the one this battle map was made from.
  const [forge, setForge] = useState<{ map: unknown | null } | null>(null);
  const openForge = async (edit: boolean) => {
    if (!edit) return setForge({ map: null });
    try {
      setForge({ map: await loadForgeMap(scene.id) });
    } catch (err) {
      toast.error(err, 'Open the map in Battlemap Forge');
    }
  };
  const fromForge = async (uvtt: UvttImport, map: unknown) => {
    if (!user) throw new Error('Not signed in');
    await applyMapToBattle({ entity, scene: isDraft ? null : scene, uvtt, user, forgeMap: map, grid });
    setGridDraft(null);
    setPanelOpen(false);
    toast.success(`Map from Battlemap Forge: ${uvtt.cols} × ${uvtt.rows} squares, ${uvtt.walls.length / 4} walls, ${uvtt.doors.length / 4} doors`);
  };
  const clearWalls = async () => {
    if (await confirm({ title: 'Remove all walls and doors?', confirmLabel: 'Remove', danger: true })) run(() => updateScene(scene.id, { walls: '', doors: '', openDoors: [] }), 'Remove walls');
  };
  const setActive = (active: boolean) => run(() => updateScene(scene.id, { active }), 'Battle mode');
  const clearAllDrawings = async () => {
    if (await confirm({ title: 'Clear every drawing on this map?', confirmLabel: 'Clear', danger: true })) {
      const copy = [...drawings];
      run(() => clearDrawings(scene.id, scene.campaignId), 'Clear drawings').then((ok) => ok && pushUndo('Drawings cleared', () => Promise.all(copy.map((d) => restoreDrawing(scene.id, d))), true));
    }
  };
  const clearAllTokens = async () => {
    if (await confirm({ title: 'Remove every token from this map?', confirmLabel: 'Remove', danger: true })) {
      const copy = [...allTokens];
      const hp = { ...(secret?.hp ?? {}) };
      run(() => clearTokens(scene.id, scene.campaignId), 'Remove tokens').then(
        (ok) => ok && pushUndo('Every token removed', () => Promise.all(copy.map((t) => restoreToken(scene.id, t, hp[t.id]))), true),
      );
    }
  };
  const remove = async () => {
    if (await confirm({ title: 'Delete this battle map?', message: 'Tokens, drawings, fog and walls go too. The map image stays on the entry.', confirmLabel: 'Delete', danger: true })) {
      if (await run(() => deleteScene(scene.id, scene.campaignId), 'Delete battle map')) navigate(`/entity/${entity.id}`, { replace: true });
    }
  };

  const toggleShare = (d: Drawing) =>
    shareDrawing(scene.id, d.id, !d.shared)
      .then(() => toast.show(d.shared ? 'Drawing hidden from players' : 'Drawing shown to players'))
      .catch((err) => toast.error(err, 'Share drawing'));
  const selectedDrawing = drawingId ? drawings.find((d) => d.id === drawingId) : undefined;
  // Dragging a selected drawing: it's saved as a copy at the new place (two writes), selection follows.
  const moveSelectedDrawing = (d: Drawing, dx: number, dy: number) => {
    moveDrawing(scene.id, d, dx, dy)
      .then((moved) => {
        setDrawingId(moved.id);
        pushUndo('Drawing moved', () => moveDrawing(scene.id, moved, -dx, -dy).then(() => setDrawingId(null)));
      })
      .catch((err) => toast.error(err, 'Move drawing'));
  };
  const myDrawings = drawings.filter((d) => d.by === uid);
  const eraseMine = () => {
    const list = [...myDrawings];
    if (!list.length) return;
    pushUndo(`${list.length} drawing${list.length === 1 ? '' : 's'} erased`, () => Promise.all(list.map((d) => restoreDrawing(scene.id, d))), true);
    Promise.all(list.map((d) => deleteDrawing(scene.id, d.id))).catch((err) => toast.error(err, 'Erase drawings'));
  };

  const onMap = useMemo(() => new Set(allTokens.map((t) => t.entityId).filter((x): x is string => !!x)), [allTokens]);
  const selectedEntity = selected ? entityOf(selected) : undefined;

  const toolbar = !isDraft && (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 shadow-lg backdrop-blur">
        <ToolButton label="Select and move (V)" active={tool === 'select'} onClick={() => setTool('select')}>
          <MousePointer2 size={17} />
        </ToolButton>
        <ToolButton label="Measure (M)" active={tool === 'measure'} onClick={() => setTool('measure')}>
          <RulerIcon size={17} />
        </ToolButton>
        <ToolButton label="Draw (D)" active={tool === 'draw'} onClick={() => setTool('draw')}>
          <Pencil size={17} />
        </ToolButton>
        <ToolButton label="Ping (P)" active={tool === 'ping'} onClick={() => setTool('ping')}>
          <Locate size={17} />
        </ToolButton>
        <ToolButton label="Erase drawings (E)" active={tool === 'erase'} onClick={() => setTool('erase')}>
          <Eraser size={17} />
        </ToolButton>
        {asDM && fogOn && (
          <ToolButton label="Fog brush (F)" active={tool === 'fog'} onClick={() => setTool('fog')}>
            <CloudFog size={17} />
          </ToolButton>
        )}
        <ToolButton label={undoCount ? `Undo: ${undoStack.current[undoStack.current.length - 1]?.label} (Ctrl+Z)` : 'Nothing to undo'} onClick={() => undo()} disabled={!undoCount}>
          <Undo2 size={17} />
        </ToolButton>
        <ToolButton label="Dice and table chat (R)" onClick={() => openTableChat({ dice: true })}>
          <Dices size={17} />
        </ToolButton>
        {(myCharacterAny || asDM) && (
          <ToolButton label="Spells and abilities (B)" onClick={() => openQuickBook({ toggle: true })}>
            <BookOpen size={17} />
          </ToolButton>
        )}
        {(asDM || myCharacter) && <span className="mx-0.5 h-6 w-px bg-stone-700" />}
        {asDM ? (
          <>
            <ToolButton label="Add tokens" onClick={() => setAddOpen(true)}>
              <UserPlus size={17} />
            </ToolButton>
            <ToolButton label="Harvest the fallen (Scavenger's Codex)" onClick={() => setHarvestOpen(true)}>
              <GiKnapsack size={17} />
            </ToolButton>
          </>
        ) : (
          myCharacter && (
            <ToolButton label={`Place ${myCharacter.name}`} onClick={() => (setArmed(specForEntity(myCharacter)), setTool('select'))}>
              <UserPlus size={17} />
            </ToolButton>
          )
        )}
      </div>
      {tool === 'erase' && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 text-xs shadow-lg backdrop-blur">
          <span className="px-2 text-stone-400">Click a drawing to erase it</span>
          <button type="button" className="rounded-md px-2.5 py-1.5 font-semibold text-stone-200 hover:bg-stone-800 disabled:opacity-40" disabled={!myDrawings.length} onClick={eraseMine}>
            Erase all mine{myDrawings.length ? ` (${myDrawings.length})` : ''}
          </button>
        </div>
      )}
      {tool === 'draw' && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 shadow-lg backdrop-blur">
          {DRAW_SHAPES.map((s) => (
            <ToolButton key={s.kind} label={s.label} active={drawKind === s.kind} onClick={() => setDrawKind(s.kind)}>
              <s.icon size={16} />
            </ToolButton>
          ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {TEMPLATE_SHAPES.map((s) => (
            <ToolButton key={s.kind} label={s.label} active={drawKind === s.kind} onClick={() => setDrawKind(s.kind)}>
              <s.icon size={16} />
            </ToolButton>
          ))}
          {drawKind === 'beam' &&
            [1, 2].map((w) => (
              <button key={w} type="button" onClick={() => setBeamWidth(w)} className={clsx('rounded-md px-2 py-1.5 text-xs', beamWidth === w ? 'bg-stone-700 text-stone-50' : 'text-stone-400 hover:bg-stone-800')}>
                {w * grid.feet} ft wide
              </button>
            ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {INK_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Ink ${c}`} onClick={() => setInk(c)} className={clsx('m-0.5 size-6 rounded-full ring-2', ink === c ? 'ring-amber-400' : 'ring-stone-700')} style={{ background: c }} />
          ))}
          {!TEMPLATES.includes(drawKind) && (
            <>
              <span className="mx-0.5 h-6 w-px bg-stone-700" />
              {PEN_SIZES.map((p, i) => (
                <ToolButton key={p.v} label={p.label} active={pen === p.v} onClick={() => setPen(p.v)}>
                  {/* The dot in the pen's own colour, with a thin ring so black and white inks show on any button. */}
                  <span
                    className="block rounded-full"
                    style={{
                      width: `${0.3 + i * 0.2}rem`,
                      height: `${0.3 + i * 0.2}rem`,
                      background: ink,
                      boxShadow: pen === p.v ? '0 0 0 1.5px rgba(245,236,217,.9)' : '0 0 0 1px rgba(28,20,13,.45)',
                    }}
                  />
                </ToolButton>
              ))}
            </>
          )}
          {isDM && (
            <>
              <span className="mx-0.5 h-6 w-px bg-stone-700" />
              <button
                type="button"
                aria-pressed={drawShared}
                onClick={() => setDrawShared((v) => !v)}
                title="Your drawings are private unless this is on. Click a drawing later to show or hide it."
                className={clsx('flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold', drawShared ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800')}
              >
                {drawShared ? <Eye size={13} /> : <EyeOff size={13} />} {drawShared ? 'Players see it' : 'Only you'}
              </button>
            </>
          )}
        </div>
      )}
      {tool === 'fog' && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 text-xs shadow-lg backdrop-blur">
          {[true, false].map((r) => (
            <button key={String(r)} type="button" onClick={() => setFogReveal(r)} className={clsx('rounded-md px-2.5 py-1.5 font-semibold', fogReveal === r ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800')}>
              {r ? 'Reveal' : 'Hide'}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {[1, 3, 5].map((n) => (
            <button key={n} type="button" onClick={() => setFogSize(n)} className={clsx('rounded-md px-2 py-1.5', fogSize === n ? 'bg-stone-700 text-stone-50' : 'text-stone-400 hover:bg-stone-800')} aria-label={`Brush ${n} squares`}>
              {n}×{n}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const overlay = (
    <>
      {/* On phones this column starts below the toolbar. */}
      <div className="absolute top-14 right-2 flex flex-col items-end gap-2 sm:top-2 sm:pt-safe">
        {asDM && panelOpen ? (
          <ScenePanel
            scene={scene}
            isDraft={isDraft}
            tab={panelTab}
            onTab={setPanelTab}
            grid={grid}
            onGrid={setGridDraft}
            gridDirty={!!gridDraft && JSON.stringify(gridDraft) !== JSON.stringify(scene.grid)}
            onSaveGrid={saveGrid}
            onCreate={create}
            onFogMode={setFogMode}
            onFogAll={fogAll}
            showWalls={showWalls}
            onShowWalls={setShowWalls}
            onImport={importFile}
            importing={importing}
            onForge={openForge}
            hasForge={!isDraft && !!scene.forgeAt}
            onClearWalls={clearWalls}
            onActive={setActive}
            onClearDrawings={clearAllDrawings}
            onClearTokens={clearAllTokens}
            onDelete={remove}
            onClose={() => (setPanelOpen(false), setGridDraft(null))}
            busy={busy}
          />
        ) : (
          !isDraft && <InitiativeTracker scene={scene} tokens={tokens} tokensReady={tokensReady} uid={uid} asDM={asDM} entityMap={entityMap} onSelect={(id) => setSelectedId(id)} onHover={setSpotlightId} highlightId={mapHoverId} />
        )}
      </div>
      {selectedDrawing && (isDM || selectedDrawing.by === uid) && !selected && (
        <div className="absolute bottom-2 left-2 w-72 rounded-xl border border-stone-700/80 bg-stone-950/95 p-3 text-sm shadow-2xl backdrop-blur pb-safe">
          <div className="flex items-center gap-2">
            <span className="size-4 shrink-0 rounded-full ring-2 ring-stone-700" style={{ background: selectedDrawing.color }} />
            <span className="flex-1 font-semibold text-stone-100">{selectedDrawing.by === uid ? 'Your drawing' : `Drawing by ${memberName(selectedDrawing.by)}`}</span>
            <button type="button" className="btn-icon-sm" aria-label="Close" onClick={() => setDrawingId(null)}>
              <X size={15} />
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-400">
            Drag it to move it.{' '}
            {isDM && <>{selectedDrawing.shared ? 'Players can see it.' : 'Only you can see it.'} Right-click a drawing to switch quickly.</>}
          </p>
          <div className="mt-2 flex gap-1.5">
            {isDM && (
              <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => toggleShare(selectedDrawing)}>
                {selectedDrawing.shared ? <EyeOff size={13} /> : <Eye size={13} />} {selectedDrawing.shared ? 'Hide from players' : 'Show to players'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm text-rose-300"
              onClick={() => {
                const d = selectedDrawing;
                pushUndo('Drawing deleted', () => restoreDrawing(scene.id, d), true);
                deleteDrawing(scene.id, d.id).catch((err) => toast.error(err, 'Delete drawing'));
                setDrawingId(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {selected && !isDraft && (
        <div ref={cardRef} className={clsx('absolute bottom-2 pb-safe', cardRight ? 'right-16' : 'left-2')}>
          <TokenCard
            key={selected.id}
            token={selected}
            sceneId={scene.id}
            asDM={asDM}
            uid={uid}
            entity={selectedEntity && canView(selectedEntity) ? selectedEntity : undefined}
            canEditEntity={!!selectedEntity && canEdit(selectedEntity)}
            secretHp={secret?.hp?.[selected.id]}
            players={players}
            onClose={() => setSelectedId(null)}
            onOpenEntry={openEntry}
            onUndoable={pushUndo}
            combat={scene.combat}
            feetPerSquare={grid.feet}
            onFramed={(entityId, img) =>
              Promise.all(allTokens.filter((x) => x.entityId === entityId && x.img !== img).map((x) => updateToken(scene.id, x.id, { img }))).catch((err) => toast.error(err, 'Token picture'))
            }
          />
        </div>
      )}
      {ruler && ruler.pts.length > 1 && ruler.label !== '0 ft' && (
        // The measurement, big and the same size at any zoom: when you measure, it's the number you want.
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 sm:top-3" aria-live="polite">
          <div className="flex flex-col items-center rounded-2xl border border-stone-600/70 bg-stone-950/92 px-5 py-2 text-center shadow-2xl backdrop-blur">
            <div className="font-display text-4xl leading-tight font-bold text-stone-50 tabular-nums">{ruler.label}</div>
            <div className="text-sm text-stone-400 tabular-nums">
              {(() => {
                const legs = ruler.pts.slice(1).map((p, i) => distanceFeet(ruler.pts[i], p, grid)).filter((ft) => ft > 0);
                const ft = legs.reduce((a, b) => a + b, 0);
                const squares = Math.round(ft / (grid.feet || 5));
                return `${squares} square${squares === 1 ? '' : 's'}${legs.length > 1 ? ` · ${legs.join(' + ')} ft` : ''}`;
              })()}
            </div>
            {clickRuler.current && measuring.current && <div className="mt-0.5 text-xs text-stone-500">Click to turn · right-click: undo a turn · double-click: done · Esc: stop</div>}
          </div>
        </div>
      )}
      {/* Any tool but "select": how to stop using it (Escape, or this button on a touch screen). */}
      {tool !== 'select' && !casting && !armed && !isDraft && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-stone-600/70 bg-stone-950/92 py-1 pr-1 pl-3 text-xs text-stone-300 shadow-lg backdrop-blur">
          <span>
            {{ measure: 'Measuring', draw: 'Drawing', ping: 'Pinging', erase: 'Erasing', fog: 'Painting fog' }[tool as string] ?? 'Tool on'}
            <span className="hidden text-stone-500 sm:inline"> · Esc to stop</span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm min-h-7 rounded-full px-2.5" onClick={() => (stopGestures(), setTool('select'))}>
            <X size={13} /> Done
          </button>
        </div>
      )}
      {casting && (
        <div className="absolute inset-x-2 bottom-2 mr-14 flex items-center gap-2 rounded-lg border border-violet-400/60 bg-stone-950/92 px-3 py-2 text-sm text-violet-100 backdrop-blur sm:right-auto sm:left-1/2 sm:mr-0 sm:-translate-x-1/2">
          <MapPin size={16} className="shrink-0 text-violet-300" />
          <span className="flex-1">
            {casting.fromEntity || casting.fromSelected ? 'Point where it goes' : 'Move to aim'}, then click or tap to place <strong>{casting.spell}</strong> ({casting.area.f}-ft {casting.area.k})
          </span>
          <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={() => (setCasting(null), setDraft(null))}>
            <X size={15} />
          </button>
        </div>
      )}
      {armed && (
        <div className="absolute inset-x-2 bottom-2 mr-14 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-stone-950/92 px-3 py-2 text-sm text-amber-100 backdrop-blur sm:right-auto sm:left-1/2 sm:mr-0 sm:-translate-x-1/2">
          <MapPin size={16} className="shrink-0 text-amber-400" />
          <span className="flex-1">
            Tap the map to place <strong>{armed.count > 1 ? `${armed.count} × ${armed.name}` : armed.name}</strong>
          </span>
          <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={() => setArmed(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      {isDM && preview && <PlayerPreviewBanner onExit={() => setPreview(false)} />}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
        <Link to={entryVisible ? `/entity/${entity.id}` : '/map'} className="btn btn-ghost btn-sm" aria-label={entryVisible ? 'Back to the entry' : 'Back to the map'}>
          <ArrowLeft size={15} />
        </Link>
        <Swords size={18} className="shrink-0 text-amber-500" />
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-stone-50 sm:text-xl">{entity.name}</h1>
        {!isDraft &&
          (scene.active ? (
            <span className={clsx('chip text-emerald-200 bg-emerald-500/10 ring-emerald-500/30', isDM && 'hidden sm:inline-flex')}>Battle on</span>
          ) : (
            isDM && <span className="chip hidden text-stone-400 ring-stone-600 sm:inline-flex">Preparing</span>
          ))}
        {isDM && !isDraft && (
          <>
            <button type="button" className={clsx('btn btn-sm', scene.active ? 'btn-secondary' : 'btn-primary')} onClick={() => setActive(!scene.active)} disabled={busy}>
              <Swords size={14} /> {scene.active ? 'End battle' : 'Start battle'}
            </button>
            <button type="button" className={clsx('btn btn-sm', preview ? 'btn-primary' : 'btn-ghost')} onClick={() => setPreview(!preview)} aria-pressed={preview}>
              <Eye size={14} /> <span className="hidden sm:inline">Player view</span>
            </button>
            {!preview && (
              <button type="button" className={clsx('btn btn-sm', panelOpen ? 'btn-primary' : 'btn-ghost')} onClick={() => (setPanelOpen((o) => !o), setGridDraft(null))} aria-pressed={panelOpen}>
                <Settings2 size={14} /> <span className="hidden sm:inline">Settings</span>
              </button>
            )}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 px-2 pb-2 sm:px-4 sm:pb-4">
        <MapViewer
          src={src}
          alt={entity.name}
          pins={[]}
          fill
          pageFullscreen
          onFullscreenChange={setFullscreen}
          crosshair={!!armed}
          onMapClick={(x, y) => (armed ? placeArmed(x, y) : tokenHold.active ? undefined : (setSelectedId(null), setDrawingId(null)))}
          onTool={gridDragOn ? onGridDrag : casting ? onCastTool : !isDraft && tool !== 'select' ? onTool : null}
          onHover={casting ? onCastHover : tool === 'measure' ? onRulerHover : null}
          toolbar={toolbar}
          overlay={overlay}
          layers={(api) => (
            <BattleLayer
              api={api}
              scene={scene}
              grid={grid}
              tokens={tokens}
              drawings={asDM ? drawings : drawings.filter((d) => d.shared !== false)}
              // Your own ruler is already on screen; don't draw its shared copy on top of it.
              marks={marks.filter((m) => !(m.kind === 'measure' && m.id === `${uid}-m`))}
              uid={uid}
              asDM={asDM}
              tool={tool}
              selectedId={selectedId}
              fogPaint={fogPaint}
              showWalls={asDM && showWalls}
              ruler={ruler}
              draft={draft}
              refs={{ api: apiRef, board: boardRef, mask: maskRef }}
              thumbOf={thumbOf}
              hpOf={hpOf}
              canMove={canMove}
              canErase={canErase}
              onSelect={(id) => (setSelectedId(id), setDrawingId(null))}
              onMove={(id, x, y) => {
                const t = allTokens.find((k) => k.id === id);
                if (t) pushUndo(`Moving ${t.name}`, () => moveToken(scene.id, id, t.x, t.y));
                moveToken(scene.id, id, x, y).catch((err) => toast.error(err, 'Move token'));
              }}
              onBlocked={async (t, x, y) => {
                // Never a hard stop: teleports, climbing or the DM's say-so all move through walls.
                const ok = await confirm({
                  title: `No walking path for ${t.name}`,
                  message: 'Walls or a closed door are in the way. Move there anyway (a teleport, climbing, or the DM said so)?',
                  confirmLabel: 'Move anyway',
                });
                if (!ok) return;
                pushUndo(`Moving ${t.name}`, () => moveToken(scene.id, t.id, t.x, t.y));
                moveToken(scene.id, t.id, x, y).catch((err) => toast.error(err, 'Move token'));
              }}
              speedOf={speedOf}
              onOpen={(t) => {
                const e = entityOf(t);
                if (e && canView(e)) openEntry(e);
              }}
              onDoor={(i) => {
                // Just this door, so undo can't close doors someone else opened meanwhile.
                const wasOpen = (scene.openDoors ?? []).includes(i);
                pushUndo(wasOpen ? 'Closing a door' : 'Opening a door', () => setDoorOpen(scene.id, i, wasOpen));
                setDoorOpen(scene.id, i, !wasOpen).catch((err) => toast.error(err, 'Door'));
              }}
              onErase={(d) => {
                pushUndo('Erasing a drawing', () => restoreDrawing(scene.id, d), d.by !== uid);
                deleteDrawing(scene.id, d.id).catch((err) => toast.error(err, 'Erase drawing'));
              }}
              selectedDrawingId={drawingId}
              onDrawingSelect={(d) => (setDrawingId(d.id), setSelectedId(null))}
              onDrawingMove={moveSelectedDrawing}
              spotlightId={spotlightId}
              onTokenHover={setMapHoverId}
              onDrawingShare={isDM ? toggleShare : undefined}
              onDiscovered={isDM && !isDraft ? (ids) => markKnown(scene.id, ids).catch(() => undefined) : undefined}
            />
          )}
        />
      </div>
      <Modal open={!!entryOpen} onClose={() => setEntryOpen(null)} title="Quick view" size="lg">
        {entryOpen && (
          <div className="-mx-5 -my-4">
            <EntityView entityId={entryOpen} variant="panel" />
          </div>
        )}
      </Modal>
      {asDM && harvestOpen && <HarvestModal open onClose={() => setHarvestOpen(false)} tokens={allTokens} entityMap={entityMap} />}
      {asDM && <AddTokens open={addOpen} onClose={() => setAddOpen(false)} onArm={(s) => (setArmed(s), setTool('select'))} onMap={onMap} tokens={allTokens} />}
      {forge && <ForgeModal name={entity.name} map={forge.map} onSend={fromForge} onClose={() => setForge(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function BattleMap() {
  const { id } = useParams<{ id: string }>();
  const { isDM, currentCampaign, user } = useAuth();
  const { entityMap, loading, canView } = useCampaignData();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  // Battlemap Forge from the empty states (no map image yet, or it went missing).
  const [forge, setForge] = useState<{ map: unknown | null } | null>(null);
  const entity = id ? entityMap.get(id) : undefined;
  const entryVisible = !!entity && canView(entity);
  // Members can read a battle map even when its place is secret to them.
  const state = useScene(id, currentCampaign?.id, isDM);
  const mediaId = (entryVisible ? entity!.mapConfig?.mediaId : undefined) ?? state.scene?.mediaId;
  const { src, loading: imgLoading } = useImageSrc(mediaId ? `media:${mediaId}` : null);
  const draft = useMemo(() => (entity ? newScene(entity) : null), [entity?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = entryVisible ? `/entity/${id}` : '/map';
  const forgeHere = isDM && entity && user;
  // "Battle here → at a new pin" on the world map lands here with ?start=forge.
  const [params, setParams] = useSearchParams();
  const start = params.get('start');
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || loading || !state.ready || !forgeHere) return;
    started.current = true;
    setParams({}, { replace: true });
    if (mediaId) return;
    if (start === 'forge') setForge({ map: null });
  }, [start, loading, state.ready, forgeHere, mediaId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !state.ready) return <Spinner className="py-24" label="Setting up the table…" />;
  if (!entryVisible && !state.scene) {
    return (
      <Page>
        <EmptyState icon={Swords} title="Battle map not found" action={<Link to="/map" className="btn btn-secondary">Back to the map</Link>} />
      </Page>
    );
  }
  const name = entity?.name ?? state.scene?.name ?? 'Battle map';
  const forgeActions = (fallback: ReactNode) =>
    forgeHere ? (
      <div className="flex flex-wrap justify-center gap-2">
        {state.scene?.forgeAt && (
          <button type="button" className="btn btn-primary" onClick={() => loadForgeMap(id!).then((map) => setForge({ map }), (err) => toast.error(err, 'Open the map'))}>
            <Hammer size={15} /> Edit the map in Battlemap Forge
          </button>
        )}
        <button type="button" className={state.scene?.forgeAt ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => setForge({ map: null })}>
          <Hammer size={15} /> Make a map in Battlemap Forge
        </button>
        {fallback}
      </div>
    ) : (
      fallback
    );
  const forgeModal =
    forge && forgeHere ? (
      <ForgeModal
        name={name}
        map={forge.map}
        onClose={() => setForge(null)}
        onSend={async (uvtt, map) => {
          await applyMapToBattle({ entity: entity!, scene: state.scene, uvtt, user: user!, forgeMap: map });
          toast.success(`Battle map ready: ${uvtt.cols} × ${uvtt.rows} squares`);
        }}
      />
    ) : null;
  if (!mediaId) {
    return (
      <Page>
        <EmptyState
          icon={Swords}
          title="No map image yet"
          action={forgeActions(<Link to={isDM ? `/entity/${id}/edit` : back} className="btn btn-secondary">{isDM ? 'Add a map image' : 'Back'}</Link>)}
        >
          {isDM ? 'Make one in Battlemap Forge (it comes with walls and doors), or give this entry a map image in the editor.' : 'This place has no map yet.'}
        </EmptyState>
        {forgeModal}
      </Page>
    );
  }
  if (!state.scene && !isDM) {
    return (
      <Page>
        <EmptyState icon={Swords} title="No battle here" action={<Link to={back} className="btn btn-secondary">Back</Link>}>
          The DM hasn’t set up a battle map for {name}.
        </EmptyState>
      </Page>
    );
  }
  if (state.scene && !state.scene.active && !isDM) {
    return (
      <Page>
        <EmptyState icon={Swords} title="The battle hasn’t started" action={<Link to={back} className="btn btn-secondary">Back</Link>}>
          You’ll get a “Join battle” banner when the DM starts it.
        </EmptyState>
      </Page>
    );
  }
  if (imgLoading) return <Spinner className="py-24" label="Unrolling the map…" />;
  if (!src) {
    // The image document is gone (deleted elsewhere): say so rather than spinning forever.
    return (
      <Page>
        <EmptyState icon={Swords} title="The map image is missing" action={forgeActions(<Link to={isDM ? `/entity/${id}/edit` : back} className="btn btn-secondary">{isDM ? 'Add a map image' : 'Back'}</Link>)}>
          {isDM ? 'Tokens, drawings and fog are still there; give the entry a map again.' : 'Ask the DM to add the map again.'}
        </EmptyState>
        {forgeModal}
      </Page>
    );
  }
  // The DM always has the entry; a player at a secret place gets a stand-in with the battle's name.
  const shown: Entity = entity ?? ({ id: id!, name, campaignId: state.scene!.campaignId } as Entity);

  const scene = state.scene ?? draft!;
  return (
    <BattleView
      key={`${id}-${state.scene ? 'live' : 'draft'}`}
      entity={shown}
      entryVisible={entryVisible}
      src={src}
      scene={scene}
      isDraft={!state.scene}
      tokens={state.tokens}
      tokensReady={state.tokensReady}
      drawings={state.drawings}
      marks={state.marks}
      secret={state.secret}
      preview={preview}
      setPreview={setPreview}
    />
  );
}
