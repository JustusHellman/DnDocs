import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import ForgeModal from '../../components/battle/ForgeModal';
import { applyMapToBattle, loadForgeMap } from '../../lib/battle/forge';
import { FogMask, parseUvtt, type Board, type UvttImport } from '../../lib/battle/geometry';
import { clearDrawings, clearTokens, createScene, deleteScene, newScene, restoreDrawing, restoreToken, updateScene } from '../../lib/battle/sceneService';
import type { Drawing, Entity, FogMode, Scene, SceneGrid, SceneSecret, Token } from '../../types';
import type { PushUndo } from './useUndoStack';

/**
 * The DM's actions on a battle map (its settings panel): make it, the grid, fog, importing a map
 * file or one from Battlemap Forge, walls, battle on/off, clearing drawings or tokens (with an
 * Undo), deleting it. Anything that loses work asks first.
 */
export function useSceneActions(o: {
  entity: Entity;
  scene: Scene;
  isDraft: boolean;
  grid: SceneGrid;
  gridDraft: SceneGrid | null;
  setGridDraft: (g: SceneGrid | null) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  boardRef: React.MutableRefObject<Board | null>;
  drawings: Drawing[];
  allTokens: Token[];
  secret: SceneSecret | null;
  run: (fn: () => Promise<unknown>, what: string) => Promise<boolean>;
  pushUndo: PushUndo;
}) {
  const { entity, scene, isDraft, grid, gridDraft, setGridDraft, panelOpen, setPanelOpen, boardRef, drawings, allTokens, secret, run, pushUndo } = o;
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [forge, setForge] = useState<{ map: unknown | null } | null>(null);

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

  const forgeModal = forge ? <ForgeModal name={entity.name} map={forge.map} onSend={fromForge} onClose={() => setForge(null)} /> : null;
  return { create, saveGrid, setFogMode, fogAll, importFile, importing, openForge, forgeModal, clearWalls, setActive, clearAllDrawings, clearAllTokens, remove };
}
