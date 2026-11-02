import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, Settings2, Swords, Hammer } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { usePeek } from '../contexts/PeekContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useImageSrc } from '../hooks/useImageSrc';
import { useScene } from '../hooks/useScene';
import MapViewer, { type ToolPhase, type ViewerApi } from '../components/map/MapViewer';
import { cellAt, tokenHold, type DraftShape, type Tool } from '../components/battle/BattleBoard';
import InitiativeTracker from '../components/battle/InitiativeTracker';
import { openTableChat } from '../components/chat/ChatDock';
import TokenCard from '../components/battle/TokenCard';
import AddTokens, { specForEntity, type TokenSpec } from '../components/battle/AddTokens';
import ScenePanel, { type PanelTab } from '../components/battle/ScenePanel';
import { EmptyState, Page, PlayerPreviewBanner, Spinner } from '../components/ui/bits';
import { Modal } from '../components/ui/Modal';
import EntityView from '../components/entity/EntityView';
import { distanceFeet, encodePoints, FogMask, percentToCells, simplify, snapTokenCorner, type Board, type Pt } from '../lib/battle/geometry';
import { applyMapToBattle, loadForgeMap } from '../lib/battle/forge';
import ForgeModal from '../components/battle/ForgeModal';
import HarvestModal from '../components/battle/HarvestModal';
import {
  addDrawing,
  addTokens,
  deleteDrawing,
  moveDrawing,
  deleteToken,
  markKnown,
  restoreDrawing,
  shareDrawing,
  moveToken,
  newScene,
  sendLiveMark,
  setDoorOpen,
  updateScene,
  updateToken,
  type NewToken,
} from '../lib/battle/sceneService';
import { spreadAround } from '../lib/battle/table';
import { readHp } from '../lib/hitPoints';
import { snapTemplate, templateLabel, type TemplateKind } from '../lib/battle/templates';
import { mapListens, setPickedToken, type CastArea } from '../lib/play/ui';
import TurnHelper from '../components/battle/TurnHelper';
import { tokensInArea } from '../lib/battle/templates';
import { setAim, setMapTokens, useAim } from '../lib/battle/aimStore';
import { tableChat } from '../lib/chat/bus';
import type { AreaShape } from '../lib/chat/events';
import type { Drawing, Entity, LiveMark, Scene, SceneGrid, SceneSecret, Token } from '../types';
import BattleLayer from './battle/BattleLayer';
import { useUndoStack } from './battle/useUndoStack';
import { useRuler } from './battle/useRuler';
import { useTurnBookkeeping } from './battle/useTurnBookkeeping';
import MapToolbar, { isTemplate, useBrush } from './battle/MapToolbar';
import SideDock from './battle/SideDock';
import MapHints from './battle/MapHints';
import { useMapAttacks } from './battle/useMapAttacks';
import { useHitDialogs } from './battle/useHitDialogs';
import { useSceneActions } from './battle/useSceneActions';
import { castAreaShape } from '../lib/battle/castArea';
import { useTableEvent } from '../lib/play/tableEvents';
import { readDevice, writeDevice } from '../lib/device';

const TURN_LIST_KEY = 'dndocs-turn-list';

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
  const uid = user!.uid;
  const asDM = isDM && !preview;

  const [tool, setTool] = useState<Tool>('select');
  // The draw tool's shape, ink and pen, and the fog brush (the toolbar sets them).
  const [brush, setBrush] = useBrush();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The spellbook knows which token is picked (a creature the DM casts for starts its area there).
  useEffect(() => {
    const t = selectedId ? allTokens.find((x) => x.id === selectedId) : null;
    setPickedToken(t ? { id: t.id, name: t.name } : null);
    return () => setPickedToken(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [armed, setArmed] = useState<TokenSpec | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(isDraft);
  const [panelTab, setPanelTab] = useState<PanelTab>('grid');
  const [gridDraft, setGridDraft] = useState<SceneGrid | null>(null);
  const [showWalls, setShowWalls] = useState(false);
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [fogPaint, setFogPaint] = useState<FogMask | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Pointing at a row in the initiative list spotlights that token; pointing at a token on the map
  // highlights its row.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [mapHoverId, setMapHoverId] = useState<string | null>(null);
  // The token card sits in the lower-left corner, unless the token you picked is there: then it
  // moves to the lower right, so it never covers the token you just tapped.
  // The side panel: the turn list (open or not, remembered on this device) and which tab shows.
  const [turnListOpen, setTurnListOpenState] = useState(() => readDevice(TURN_LIST_KEY) === '1' || readDevice('dndocs-turn-helper') === 'open');
  const setTurnListOpen = (open: boolean) => {
    setTurnListOpenState(open);
    writeDevice(TURN_LIST_KEY, open ? '1' : '0');
  };
  const [dockPick, setDockPick] = useState<'turn' | 'token'>('token');
  // Picking a target on purpose: the next token clicked becomes the acting creature's target.
  const aim = useAim();
  const [picking, setPicking] = useState<{ by: string; byName: string } | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const [turnSlot, setTurnSlot] = useState<HTMLDivElement | null>(null);
  const [entryOpen, setEntryOpen] = useState<string | null>(null);
  // In full screen the side panel would open behind the map, so entries open in a dialog instead.
  const openEntry = (e: Entity) => (fullscreen ? setEntryOpen(e.id) : peek(e));

  const apiRef = useRef<ViewerApi | null>(null);
  const boardRef = useRef<Board | null>(null);
  const maskRef = useRef<FogMask | null>(null);
  const draftRef = useRef<DraftShape | null>(null);
  draftRef.current = draft;
  const fogRef = useRef<FogMask | null>(null);
  const draftOrigin = useRef<Pt | null>(null);
  // A spell's area to place (from a cast in the chat): its outline follows the pointer, a click
  // or tap puts it down, Escape cancels.
  const [casting, setCasting] = useState<CastArea | null>(null);
  const allTokensRef = useRef(allTokens);
  allTokensRef.current = allTokens;
  // Who's on this map, for a heal from a spell's dialog (it goes through the map's dialog then).
  const tokensKey = allTokens.map((t) => `${t.id}:${t.entityId}:${t.name}`).join('|');
  useEffect(() => setMapTokens(allTokens.map((t) => ({ id: t.id, entityId: t.entityId, name: t.name }))), [tokensKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new turn: the last one's target is forgotten (the next creature picks its own).
  useEffect(() => {
    setAim(null);
    setPicking(null);
  }, [scene.combat?.turn, scene.combat?.active]);
  const castingRef = useRef<CastArea | null>(null);
  castingRef.current = casting;

  // Undo: each person's own recent changes on this map.
  const { push: pushUndo, undo, undoRef, last: lastUndo } = useUndoStack();

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
  const fogOn = (scene.fog?.mode ?? 'off') !== 'off';
  // Picking a token shows its card, unless it's the one whose turn it is (its options then).
  useEffect(() => {
    if (!selected) return setDockPick('turn');
    setDockPick(scene.combat?.active && scene.combat.turn === selected.id ? 'turn' : 'token');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId && !tokens.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tokens, selectedId]);
  useEffect(() => {
    if (tool === 'fog' && (!asDM || !fogOn)) setTool('select');
  }, [tool, asDM, fogOn]);

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
  // Turns in a fight: whose live state a token's is, its speed this turn, and the bookkeeping the
  // DM's (or the player's own) screen keeps for the table.
  const { fighting, keyOf, ownerOf, turnSpeed, movedOf } = useTurnBookkeeping({ scene, allTokens, tokens, isDraft, asDM, isDM, uid, entityOf, speedOf, pushUndo });
  // Attacks (from the turn list, the character page, the chat): at the target picked on purpose.
  const attacks = useMapAttacks({ scene, tokens, aim, asDM, entityOf, pushUndo });
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
  // Players' rulers are shared with the table. The DM's stay private: a line between hidden
  // monsters would give them away (the DM can ping to point at something).
  const measure = useRuler({ active: tool === 'measure', grid, apiRef, boardRef, share: isDM ? null : share });
  const ruler = measure.ruler;

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
      const wrap = (v: number) => (Math.round((((v % 1) + 1) % 1) * 100) / 100) % 1;
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
    if (tool === 'measure') return measure.onTool(phase, cx, cy, pointerType);
    if (tool === 'ping') {
      if (phase === 'up') share({ kind: 'ping', x: p.x, y: p.y });
      return;
    }
    if (tool === 'draw') {
      const d = draftRef.current;
      const template = isTemplate(brush.kind);
      if (phase === 'down') setDraft({ kind: brush.kind, color: brush.ink, points: [p, p], width: brush.kind === 'beam' ? brush.beam : undefined, thick: template ? undefined : brush.pen });
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
          const label = cur.kind === 'line' ? `${distanceFeet(a0, p, grid)} ft` : `${Math.round(Math.abs(p.x - a0.x)) * grid.feet} × ${Math.round(Math.abs(p.y - a0.y)) * grid.feet} ft`;
          return { ...cur, points: [a0, p], label };
        });
      } else if (phase === 'up' && d) {
        draftOrigin.current = null;
        const pts = d.kind === 'free' ? simplify(d.points).slice(0, 600) : d.points;
        const size = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
        if (size > 0.1 || (d.kind === 'free' && pts.length > 2)) {
          // The shape shows at once (the listener has it before the server confirms), so the draft
          // goes now: waiting for the server would wipe a quick second stroke.
          const { drawing, saved } = addDrawing(scene.id, {
            campaignId: scene.campaignId,
            by: uid,
            kind: d.kind,
            color: d.color,
            points: encodePoints(pts),
            width: d.width,
            thick: d.thick,
            shared: isDM ? brush.shared : true,
          });
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
        fogRef.current.paint(at, brush.fogSize / 2 + 0.2, brush.fogReveal);
        setFogPaint(fogRef.current.clone());
      } else if (phase === 'move' && fogRef.current) {
        fogRef.current.paint(at, brush.fogSize / 2 + 0.2, brush.fogReveal);
        setFogPaint(fogRef.current.clone());
      } else if (phase === 'up' && fogRef.current) {
        // One write per brush stroke.
        const m = fogRef.current;
        fogRef.current = null;
        const before = { 'fog.revealed': scene.fog.revealed, 'fog.cols': scene.fog.cols, 'fog.rows': scene.fog.rows };
        pushUndo(brush.fogReveal ? 'Fog revealed' : 'Fog hidden', () => updateScene(scene.id, before));
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

  // While the map is open: spells' areas come here to be placed, and damage (or healing) for
  // tokens to be shown and applied.
  useEffect(() => {
    if (isDraft) return;
    const stop = mapListens();
    return () => {
      stop();
      setAim(null);
      setMapTokens([]);
    };
  }, [isDraft]);
  useTableEvent(
    'cast-area',
    (c) => {
      setTool('select');
      setArmed(null);
      setCasting(c);
    },
    !isDraft,
  );
  const { dialogs: hitDialogs, askArea } = useHitDialogs({ scene, allTokens, entityOf, secretHp: secret?.hp ?? {}, pushUndo, enabled: !isDraft });

  /** The area's outline for the pointer at `p` (squares): from the caster when the spell starts there. */
  const castShape = (c: CastArea, p: Pt) =>
    castAreaShape(c, p, grid, c.fromEntity ? allTokens.find((t) => t.entityId === c.fromEntity) : c.fromSelected && selectedId ? allTokens.find((t) => t.id === selectedId) : undefined);
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
      // Who's inside: the DM applies the damage now; a player's area goes to the chat for the DM.
      if (c.hit && (c.hit.dmg || c.hit.save) && d.points.length >= 2) {
        const shape = { k: d.kind as AreaShape['k'], a: d.points[0], b: d.points[1], ...(d.width ? { w: d.width } : {}) };
        const inside = (list: Token[]) => tokensInArea(shape.k, shape.a, shape.b, shape.w, list);
        if (asDM) {
          const caught = inside(allTokens);
          if (caught.length) askArea(c.spell, c.hit, caught);
        } else {
          const names = inside(tokens).map((t) => t.name);
          if (names.length) tableChat.event({ t: 'area', spell: c.spell, scene: scene.id, shape, names, hit: c.hit }).catch(() => undefined);
        }
      }
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
    measure.stop();
    draftOrigin.current = null;
    setDraft(null);
    fogRef.current = null;
    setFogPaint(null);
  };
  useEffect(() => {
    stopGestures();
  }, [tool]);

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
        if (pickingRef.current) return setPicking(null);
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

  // --- DM actions: the map's settings, fog, import, Battlemap Forge, clearing ---------
  const { create, saveGrid, setFogMode, fogAll, importFile, importing, openForge, forgeModal, clearWalls, setActive, clearAllDrawings, clearAllTokens, remove } = useSceneActions({
    entity,
    scene,
    isDraft,
    grid,
    gridDraft,
    setGridDraft,
    panelOpen,
    setPanelOpen,
    boardRef,
    drawings,
    allTokens,
    secret,
    run,
    pushUndo,
  });

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
    <MapToolbar
      tool={tool}
      setTool={setTool}
      asDM={asDM}
      isDM={isDM}
      fogOn={fogOn}
      undoLabel={lastUndo?.label ?? null}
      onUndo={() => undo()}
      showBook={myCharacterAny || asDM}
      onAddTokens={() => setAddOpen(true)}
      onHarvest={() => setHarvestOpen(true)}
      placeMine={myCharacter ? { name: myCharacter.name, onPlace: () => (setArmed(specForEntity(myCharacter)), setTool('select')) } : null}
      myDrawings={myDrawings.length}
      onEraseMine={eraseMine}
      brush={brush}
      setBrush={setBrush}
      feet={grid.feet}
    />
  );

  // The turn helper follows: for a player, their token whose turn it is, or the one they picked,
  // or their character; for the DM, the picked token or else whoever's turn it is.
  const turnToken = fighting ? tokens.find((t) => t.id === scene.combat!.turn) : undefined;
  const mineTok = (t: Token | null | undefined): t is Token => !!t && t.controlledBy.includes(uid);
  const helperFor: Token | null = !fighting
    ? null
    : asDM
      ? (selected ?? turnToken ?? null)
      : mineTok(turnToken)
        ? turnToken
        : mineTok(selected)
          ? selected
          : (tokens.find((t) => mineTok(t) && entityOf(t)?.type === 'character' && t.initiative !== null && t.initiative !== undefined) ??
            tokens.find((t) => mineTok(t) && t.initiative !== null && t.initiative !== undefined) ??
            null);
  const showHelper = !!helperFor && tool === 'select' && !casting && !armed;
  // The side panel (a sheet at the bottom on phones): what the acting creature can do, and the
  // picked token's card, as two tabs.
  const turnTabOk = showHelper && turnListOpen;
  const tokenTabOk = !!selected && !isDraft && !casting && !armed;
  const dockTab: 'turn' | 'token' | null = turnTabOk && tokenTabOk ? dockPick : turnTabOk ? 'turn' : tokenTabOk ? 'token' : null;
  const short = (n: string) => (n.length <= 14 ? n : n.split(' ')[0]);
  const overlay = (
    <>
      {hitDialogs}
      <MapHints
        picking={picking}
        onCancelPicking={() => setPicking(null)}
        drawing={selectedDrawing && (isDM || selectedDrawing.by === uid) && !selected ? selectedDrawing : null}
        drawingBy={(d) => (d.by === uid ? 'Your drawing' : `Drawing by ${memberName(d.by)}`)}
        isDM={isDM}
        onCloseDrawing={() => setDrawingId(null)}
        onShareDrawing={toggleShare}
        onDeleteDrawing={(d) => {
          pushUndo('Drawing deleted', () => restoreDrawing(scene.id, d), true);
          deleteDrawing(scene.id, d.id).catch((err) => toast.error(err, 'Delete drawing'));
          setDrawingId(null);
        }}
        ruler={ruler}
        rulerFollowing={measure.following}
        grid={grid}
        tool={!casting && !armed && !isDraft ? tool : 'select'}
        onToolDone={() => (stopGestures(), setTool('select'))}
        casting={casting}
        onCancelCasting={() => (setCasting(null), setDraft(null))}
        armed={armed}
        onCancelArmed={() => setArmed(null)}
      />
      {showHelper && helperFor && (
        <TurnHelper
          scene={scene}
          tokens={tokens}
          subject={helperFor}
          entity={entityOf(helperFor)}
          liveKey={keyOf(helperFor)}
          owner={ownerOf(helperFor)}
          asDM={asDM}
          speed={speedOf(helperFor)}
          // The dots: bottom middle (beside the side panel when it reaches down).
          barClass={clsx('bottom-2 left-2 right-14 pb-safe', dockTab ? 'sm:left-24 sm:right-[25rem]' : 'sm:left-24 sm:right-24')}
          listSlot={turnSlot}
          listOpen={turnTabOk && dockTab === 'turn'}
          onList={(open) => {
            setTurnListOpen(open);
            if (open) setDockPick('turn');
          }}
          attacks={attacks}
          onPickTarget={() => setPicking({ by: helperFor.id, byName: helperFor.name })}
          onClearTarget={() => setAim(null)}
          picking={!!picking}
        />
      )}
      <SideDock
        lift={showHelper}
        top={
          asDM && panelOpen ? (
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
            !isDraft && (
              <InitiativeTracker
                scene={scene}
                tokens={tokens}
                tokensReady={tokensReady}
                uid={uid}
                asDM={asDM}
                entityMap={entityMap}
                onSelect={(id) => setSelectedId(id)}
                onHover={setSpotlightId}
                highlightId={mapHoverId}
                className="w-72 max-w-full sm:w-full"
              />
            )
          )
        }
        // The same token in both tabs: "Actions" and "Card"; two tokens: their names.
        turnTab={turnTabOk && helperFor ? { label: helperFor.id === selected?.id ? 'Actions' : short(helperFor.name), title: `What ${helperFor.name} can do` } : null}
        tokenTab={tokenTabOk && selected ? { label: helperFor?.id === selected.id && turnTabOk ? 'Card' : short(selected.name) } : null}
        tab={asDM && panelOpen ? null : dockTab}
        onTab={setDockPick}
        onClose={() => (dockTab === 'turn' ? setTurnListOpen(false) : setSelectedId(null))}
        turnSlot={setTurnSlot}
        card={
          selected && (
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
              embedded
              hideReaction={showHelper && helperFor?.id === selected.id}
              onFramed={(entityId, img) =>
                Promise.all(allTokens.filter((x) => x.entityId === entityId && x.img !== img).map((x) => updateToken(scene.id, x.id, { img }))).catch((err) => toast.error(err, 'Token picture'))
              }
            />
          )
        }
      />
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
          crosshair={!!armed || !!picking}
          onMapClick={(x, y) => (armed ? placeArmed(x, y) : tokenHold.active ? undefined : (setSelectedId(null), setDrawingId(null)))}
          onTool={gridDragOn ? onGridDrag : casting ? onCastTool : !isDraft && tool !== 'select' ? onTool : null}
          onHover={casting ? onCastHover : tool === 'measure' ? measure.onHover : null}
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
              // Placing a spell's area: a click on a token places it there (doesn't pick the token).
              tool={casting ? 'draw' : tool}
              selectedId={selectedId}
              targetId={fighting && aim ? aim.target : null}
              fogPaint={fogPaint}
              showWalls={asDM && showWalls}
              ruler={ruler}
              draft={draft}
              refs={{ api: apiRef, board: boardRef, mask: maskRef }}
              thumbOf={thumbOf}
              hpOf={hpOf}
              canMove={(t) => !picking && canMove(t)}
              canErase={canErase}
              onSelect={(id) => {
                const pk = pickingRef.current;
                if (pk) {
                  // Picking a target: this click aims, it doesn't select.
                  setPicking(null);
                  if (id === pk.by) return toast.show('That’s the one acting: pick someone else (healing yourself needs no target).');
                  const t = allTokensRef.current.find((x) => x.id === id);
                  const by = allTokensRef.current.find((x) => x.id === pk.by);
                  if (t) setAim({ by: pk.by, byName: pk.byName, byEntity: by?.entityId ?? null, target: id, targetName: t.name });
                  return;
                }
                setSelectedId(id);
                setDrawingId(null);
              }}
              onMove={(id, x, y) => {
                // Just moving: the feet a creature walked are marked on its turn dots by hand.
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
              speedOf={turnSpeed}
              movedOf={movedOf}
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
      {forgeModal}
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
        <EmptyState
          icon={Swords}
          title="Battle map not found"
          action={
            <Link to="/map" className="btn btn-secondary">
              Back to the map
            </Link>
          }
        />
      </Page>
    );
  }
  const name = entity?.name ?? state.scene?.name ?? 'Battle map';
  const forgeActions = (fallback: ReactNode) =>
    forgeHere ? (
      <div className="flex flex-wrap justify-center gap-2">
        {state.scene?.forgeAt && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              loadForgeMap(id!).then(
                (map) => setForge({ map }),
                (err) => toast.error(err, 'Open the map'),
              )
            }
          >
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
          action={forgeActions(
            <Link to={isDM ? `/entity/${id}/edit` : back} className="btn btn-secondary">
              {isDM ? 'Add a map image' : 'Back'}
            </Link>,
          )}
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
        <EmptyState
          icon={Swords}
          title="No battle here"
          action={
            <Link to={back} className="btn btn-secondary">
              Back
            </Link>
          }
        >
          The DM hasn’t set up a battle map for {name}.
        </EmptyState>
      </Page>
    );
  }
  if (state.scene && !state.scene.active && !isDM) {
    return (
      <Page>
        <EmptyState
          icon={Swords}
          title="The battle hasn’t started"
          action={
            <Link to={back} className="btn btn-secondary">
              Back
            </Link>
          }
        >
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
        <EmptyState
          icon={Swords}
          title="The map image is missing"
          action={forgeActions(
            <Link to={isDM ? `/entity/${id}/edit` : back} className="btn btn-secondary">
              {isDM ? 'Add a map image' : 'Back'}
            </Link>,
          )}
        >
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
