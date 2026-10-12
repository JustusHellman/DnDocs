import { useRef } from 'react';
import { Eye, EyeOff, FileUp, Grid3x3, Hammer, Minus, Plus, Swords, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { Segmented, Toggle } from '../ui/bits';
import { decodeNums } from '../../lib/battle/geometry';
import type { FogMode, Scene, SceneGrid } from '../../types';

export type PanelTab = 'grid' | 'fog' | 'walls' | 'scene';

interface Props {
  scene: Scene;
  /** Not saved yet: only the grid can be set up, then created. */
  isDraft: boolean;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  grid: SceneGrid;
  onGrid: (g: SceneGrid) => void;
  gridDirty: boolean;
  onSaveGrid: () => void;
  onCreate: () => void;
  onFogMode: (m: FogMode) => void;
  onFogAll: (reveal: boolean) => void;
  showWalls: boolean;
  onShowWalls: (v: boolean) => void;
  onImport: (file: File) => void;
  importing: boolean;
  /** Open Battlemap Forge: a new map, or the one this battle map was made from. */
  onForge: (edit: boolean) => void;
  /** This battle map came from Battlemap Forge (so it can be edited there again). */
  hasForge: boolean;
  onClearWalls: () => void;
  onActive: (v: boolean) => void;
  onClearDrawings: () => void;
  onClearTokens: () => void;
  onDelete: () => void;
  onClose: () => void;
  busy: boolean;
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-stone-200">{label}</span>
        {children}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export default function ScenePanel(p: Props) {
  const file = useRef<HTMLInputElement>(null);
  const g = p.grid;
  const set = (patch: Partial<SceneGrid>) => p.onGrid({ ...g, ...patch });
  const walls = decodeNums(p.scene.walls).length / 4;
  const doors = decodeNums(p.scene.doors).length / 4;
  const tabs: { value: PanelTab; label: string }[] = p.isDraft
    ? [
        { value: 'grid', label: 'Grid' },
        { value: 'walls', label: 'Import' },
      ]
    : [
        { value: 'grid', label: 'Grid' },
        { value: 'fog', label: 'Fog' },
        { value: 'walls', label: 'Walls' },
        { value: 'scene', label: 'Battle' },
      ];

  return (
    <div className="flex max-h-[min(78vh,40rem)] w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/95 text-sm shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-2">
        <Grid3x3 size={15} className="text-amber-400" />
        <span className="flex-1 font-semibold text-stone-100">{p.isDraft ? 'Set up the battle map' : 'Battle map settings'}</span>
        {!p.isDraft && (
          <button type="button" className="btn-icon-sm" aria-label="Close settings" onClick={p.onClose}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="px-3 pt-2">
        <Segmented size="sm" className="w-full" value={p.tab} onChange={p.onTab} options={tabs} />
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {p.tab === 'grid' && (
          <>
            <div>
              <span className="label">Squares across the map</span>
              <div className="flex items-center gap-1.5">
                <button type="button" className="btn btn-secondary btn-sm px-2" aria-label="One square fewer" onClick={() => set({ cols: Math.max(1, Math.round((g.cols - 1) * 10) / 10) })}>
                  <Minus size={13} />
                </button>
                <input
                  className="input min-h-8 flex-1 py-1 text-center tabular-nums"
                  type="number"
                  step={0.1}
                  min={1}
                  max={300}
                  aria-label="Squares across"
                  value={g.cols}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && v >= 1 && v <= 300) set({ cols: v });
                  }}
                />
                <button type="button" className="btn btn-secondary btn-sm px-2" aria-label="One square more" onClick={() => set({ cols: Math.min(300, Math.round((g.cols + 1) * 10) / 10) })}>
                  <Plus size={13} />
                </button>
              </div>
              <p className="hint">Count the squares printed on the map. BattlemapForge PNGs say it in the file name: battlemap-30x20-… is 30 across.</p>
            </div>
            <div>
              <span className="label">Line up the grid</span>
              <p className="mb-1.5 text-xs text-stone-500">Drag the map to slide the grid over it (while this tab is open), or nudge it here.</p>
              <label className="flex items-center gap-2 text-xs text-stone-400">
                <span className="w-14">Sideways</span>
                <input type="range" min={0} max={0.99} step={0.01} value={g.ox} onChange={(e) => set({ ox: Number(e.target.value) })} className="flex-1 accent-amber-500" />
              </label>
              <label className="mt-1 flex items-center gap-2 text-xs text-stone-400">
                <span className="w-14">Up/down</span>
                <input type="range" min={0} max={0.99} step={0.01} value={g.oy} onChange={(e) => set({ oy: Number(e.target.value) })} className="flex-1 accent-amber-500" />
              </label>
            </div>
            <Row label="Show grid">
              <Toggle checked={g.show} onChange={(v) => set({ show: v })} label="Show grid" />
            </Row>
            {g.show && (
              <div className="flex items-center gap-2">
                <span className="w-14 text-xs text-stone-400">Lines</span>
                {['#1b130c', '#ffffff'].map((c) => (
                  <button key={c} type="button" aria-label={c === '#ffffff' ? 'Light lines' : 'Dark lines'} onClick={() => set({ color: c })} className={clsx('size-6 rounded ring-2', g.color === c ? 'ring-amber-400' : 'ring-stone-700')} style={{ background: c }} />
                ))}
                <input type="range" min={0.1} max={1} step={0.05} value={g.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="flex-1 accent-amber-500" aria-label="Line strength" />
              </div>
            )}
            <Row label="Snap tokens to squares">
              <Toggle checked={g.snap} onChange={(v) => set({ snap: v })} label="Snap to grid" />
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Feet per square</span>
                <input className="input min-h-8 py-1" type="number" min={1} max={100} value={g.feet} onChange={(e) => set({ feet: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 5)) })} />
              </label>
              <label className="block">
                <span className="label">Diagonals</span>
                <select className="input min-h-8 py-1" value={g.diagonal} onChange={(e) => set({ diagonal: e.target.value as SceneGrid['diagonal'] })}>
                  <option value="5e">5 ft each (5e)</option>
                  <option value="alt">5-10-5</option>
                  <option value="euclid">Exact</option>
                </select>
              </label>
            </div>
            {!p.isDraft && p.scene.fog.mode !== 'off' && <p className="hint">Changing the squares across resets the fog you revealed by hand.</p>}
          </>
        )}

        {p.tab === 'fog' && !p.isDraft && (
          <>
            <Segmented
              size="sm"
              className="w-full"
              value={p.scene.fog.mode}
              onChange={p.onFogMode}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'manual', label: 'By hand' },
                { value: 'vision', label: 'Line of sight' },
              ]}
            />
            <p className="text-xs text-stone-400">
              {p.scene.fog.mode === 'off' && 'Players see the whole map.'}
              {p.scene.fog.mode === 'manual' && 'Players only see squares you reveal. Use the fog brush in the toolbar to reveal or hide squares.'}
              {p.scene.fog.mode === 'vision' &&
                (walls > 0
                  ? 'Players see what their tokens can see; walls and closed doors block sight. Squares you reveal with the fog brush stay visible too.'
                  : 'Players see what their tokens can see. There are no walls yet, so only a token’s sight range limits it — import walls under “Walls”.')}
            </p>
            {p.scene.fog.mode !== 'off' && (
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => p.onFogAll(true)} disabled={p.busy}>
                  <Eye size={13} /> Reveal all
                </button>
                <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => p.onFogAll(false)} disabled={p.busy}>
                  <EyeOff size={13} /> Hide all
                </button>
              </div>
            )}
          </>
        )}

        {p.tab === 'walls' && (
          <>
            <div>
              <span className="label">Battlemap Forge</span>
              <p className="mb-2 text-xs text-stone-400">
                Paint or generate the map; it comes back with the grid, walls and doors. Tokens, drawings and (if the grid stays the same) fog stay put.
              </p>
              <div className="flex flex-col gap-1.5">
                {p.hasForge && (
                  <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => p.onForge(true)} disabled={p.importing}>
                    <Hammer size={14} /> Edit this map in Battlemap Forge
                  </button>
                )}
                <button type="button" className={clsx('btn btn-sm w-full', p.hasForge ? 'btn-ghost' : 'btn-primary')} onClick={() => p.onForge(false)} disabled={p.importing}>
                  <Hammer size={14} /> {p.hasForge ? 'Start a new map instead' : 'Make a map in Battlemap Forge'}
                </button>
              </div>
            </div>
            <div>
              <span className="label">Import a Universal VTT map</span>
              <p className="mb-2 text-xs text-stone-400">
                A <code>.dd2vtt</code> file (BattlemapForge “Export for VTT”, Dungeondraft, DungeonFog…) brings the map image, the grid, walls and doors in one go. It replaces this entry’s map image. (DnDocs keeps only a compact WebP image and the walls, never the file itself.)
              </p>
              <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => file.current?.click()} disabled={p.importing}>
                {p.importing ? <div className="size-4 animate-spin rounded-full border-2 border-stone-700 border-t-amber-500" /> : <FileUp size={14} />}
                {p.importing ? 'Importing…' : 'Choose .dd2vtt file'}
              </button>
              <input
                ref={file}
                type="file"
                accept=".dd2vtt,.uvtt,.json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) p.onImport(f);
                }}
              />
            </div>
            {!p.isDraft && (
              <>
                <p className="text-xs text-stone-400">
                  {walls > 0 || doors > 0 ? `${walls} wall segments and ${doors} doors.` : 'No walls yet.'} Doors can be opened and closed by everyone with the round handle on the map.
                </p>
                <Row label="Show walls (only you)">
                  <Toggle checked={p.showWalls} onChange={p.onShowWalls} label="Show walls" />
                </Row>
                {(walls > 0 || doors > 0) && (
                  <button type="button" className="btn btn-ghost btn-sm -ml-2 text-rose-300" onClick={p.onClearWalls} disabled={p.busy}>
                    <Trash2 size={13} /> Remove walls and doors
                  </button>
                )}
              </>
            )}
          </>
        )}

        {p.tab === 'scene' && !p.isDraft && (
          <>
            <Row label="Battle mode" hint="On: players get a “Join battle” banner and can open this map.">
              <Toggle checked={p.scene.active} onChange={p.onActive} label="Battle mode" />
            </Row>
            <div className="space-y-1 border-t border-stone-800 pt-3">
              <button type="button" className="btn btn-ghost btn-sm -ml-2 w-full justify-start" onClick={p.onClearDrawings} disabled={p.busy}>
                <Trash2 size={13} /> Clear all drawings
              </button>
              <button type="button" className="btn btn-ghost btn-sm -ml-2 w-full justify-start" onClick={p.onClearTokens} disabled={p.busy}>
                <Trash2 size={13} /> Remove all tokens
              </button>
              <button type="button" className="btn btn-ghost btn-sm -ml-2 w-full justify-start text-rose-300" onClick={p.onDelete} disabled={p.busy}>
                <Trash2 size={13} /> Delete this battle map
              </button>
            </div>
          </>
        )}
      </div>

      {p.tab === 'grid' && (p.isDraft || p.gridDirty) && (
        <div className="border-t border-stone-800 p-3">
          {p.isDraft ? (
            <button type="button" className="btn btn-primary w-full" onClick={p.onCreate} disabled={p.busy}>
              <Swords size={15} /> Create battle map
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full" onClick={p.onSaveGrid} disabled={p.busy}>
              Save grid
            </button>
          )}
        </div>
      )}
    </div>
  );
}
