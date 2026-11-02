import { useState } from 'react';
import clsx from 'clsx';
import {
  Box,
  BookOpen,
  Circle,
  CloudFog,
  Dices,
  Eraser,
  Eye,
  EyeOff,
  Locate,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Ruler as RulerIcon,
  Slash,
  Spline,
  Triangle,
  Undo2,
  UserPlus,
  Zap,
} from 'lucide-react';
import { GiKnapsack } from 'react-icons/gi';
import type { Tool } from '../../components/battle/BattleBoard';
import { openTableChat } from '../../components/chat/ChatDock';
import { openQuickBook } from '../../components/play/QuickBook';
import { INK_COLORS } from '../../lib/battle/table';
import { readDevice, writeDevice } from '../../lib/device';
import type { Drawing } from '../../types';

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
  const v = Number(readDevice(PEN_KEY));
  return PEN_SIZES.some((p) => p.v === v) ? v : 0.1;
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
/** A spell-area shape (snaps to the grid, no pen size) rather than a drawing. */
export const isTemplate = (kind: Drawing['kind']) => TEMPLATES.includes(kind);

/** The draw tool's settings and the DM's fog brush. */
export interface Brush {
  kind: Drawing['kind'];
  ink: string;
  /** Pen thickness in squares (remembered on this device). */
  pen: number;
  /** A line area's width in squares. */
  beam: number;
  /** DM: new drawings shown to the players straight away (off: private notes on the map). */
  shared: boolean;
  fogReveal: boolean;
  fogSize: number;
}
export function useBrush(): [Brush, (patch: Partial<Brush>) => void] {
  const [brush, set] = useState<Brush>(() => ({ kind: 'free', ink: INK_COLORS[0], pen: savedPen(), beam: 1, shared: false, fogReveal: true, fogSize: 1 }));
  const update = (patch: Partial<Brush>) => {
    if (patch.pen !== undefined) writeDevice(PEN_KEY, String(patch.pen));
    set((b) => ({ ...b, ...patch }));
  };
  return [brush, update];
}

/** The battle map's toolbar (top left), with the draw, erase and fog tools' options under it. */
export default function MapToolbar({
  tool,
  setTool,
  asDM,
  isDM,
  fogOn,
  undoLabel,
  onUndo,
  showBook,
  onAddTokens,
  onHarvest,
  placeMine,
  myDrawings,
  onEraseMine,
  brush,
  setBrush,
  feet,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  asDM: boolean;
  isDM: boolean;
  fogOn: boolean;
  /** The last thing undo would take back (null: nothing). */
  undoLabel: string | null;
  onUndo: () => void;
  showBook: boolean;
  onAddTokens: () => void;
  onHarvest: () => void;
  /** A player's own character that isn't on the map yet. */
  placeMine: { name: string; onPlace: () => void } | null;
  myDrawings: number;
  onEraseMine: () => void;
  brush: Brush;
  setBrush: (patch: Partial<Brush>) => void;
  feet: number;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="scrollbar-none flex max-w-[calc(100vw-2.5rem)] flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 shadow-lg backdrop-blur sm:max-w-none sm:flex-wrap">
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
        <ToolButton label={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'} onClick={onUndo} disabled={!undoLabel}>
          <Undo2 size={17} />
        </ToolButton>
        <ToolButton label="Dice and table chat (R)" onClick={() => openTableChat({ dice: true })}>
          <Dices size={17} />
        </ToolButton>
        {showBook && (
          <ToolButton label="Spells and abilities (B)" onClick={() => openQuickBook({ toggle: true })}>
            <BookOpen size={17} />
          </ToolButton>
        )}
        {(asDM || placeMine) && <span className="mx-0.5 h-6 w-px bg-stone-700" />}
        {asDM ? (
          <>
            <ToolButton label="Add tokens" onClick={onAddTokens}>
              <UserPlus size={17} />
            </ToolButton>
            <ToolButton label="Harvest the fallen (Scavenger's Codex)" onClick={onHarvest}>
              <GiKnapsack size={17} />
            </ToolButton>
          </>
        ) : (
          placeMine && (
            <ToolButton label={`Place ${placeMine.name}`} onClick={placeMine.onPlace}>
              <UserPlus size={17} />
            </ToolButton>
          )
        )}
      </div>
      {tool === 'erase' && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 text-xs shadow-lg backdrop-blur">
          <span className="px-2 text-stone-400">Click a drawing to erase it</span>
          <button type="button" className="rounded-md px-2.5 py-1.5 font-semibold text-stone-200 hover:bg-stone-800 disabled:opacity-40" disabled={!myDrawings} onClick={onEraseMine}>
            Erase all mine{myDrawings ? ` (${myDrawings})` : ''}
          </button>
        </div>
      )}
      {tool === 'draw' && (
        <div className="scrollbar-none flex max-w-[calc(100vw-2.5rem)] flex-nowrap items-center gap-0.5 overflow-x-auto rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 shadow-lg backdrop-blur sm:max-w-none sm:flex-wrap">
          {DRAW_SHAPES.map((s) => (
            <ToolButton key={s.kind} label={s.label} active={brush.kind === s.kind} onClick={() => setBrush({ kind: s.kind })}>
              <s.icon size={16} />
            </ToolButton>
          ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {TEMPLATE_SHAPES.map((s) => (
            <ToolButton key={s.kind} label={s.label} active={brush.kind === s.kind} onClick={() => setBrush({ kind: s.kind })}>
              <s.icon size={16} />
            </ToolButton>
          ))}
          {brush.kind === 'beam' &&
            [1, 2].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setBrush({ beam: w })}
                className={clsx('rounded-md px-2 py-1.5 text-xs', brush.beam === w ? 'bg-stone-700 text-stone-50' : 'text-stone-400 hover:bg-stone-800')}
              >
                {w * feet} ft wide
              </button>
            ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {INK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Ink ${c}`}
              onClick={() => setBrush({ ink: c })}
              className={clsx('m-0.5 size-6 rounded-full ring-2', brush.ink === c ? 'ring-amber-400' : 'ring-stone-700')}
              style={{ background: c }}
            />
          ))}
          {!isTemplate(brush.kind) && (
            <>
              <span className="mx-0.5 h-6 w-px bg-stone-700" />
              {PEN_SIZES.map((p, i) => (
                <ToolButton key={p.v} label={p.label} active={brush.pen === p.v} onClick={() => setBrush({ pen: p.v })}>
                  {/* The dot in the pen's own colour, with a thin ring so black and white inks show on any button. */}
                  <span
                    className="block rounded-full"
                    style={{
                      width: `${0.3 + i * 0.2}rem`,
                      height: `${0.3 + i * 0.2}rem`,
                      background: brush.ink,
                      boxShadow: brush.pen === p.v ? '0 0 0 1.5px rgba(245,236,217,.9)' : '0 0 0 1px rgba(28,20,13,.45)',
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
                aria-pressed={brush.shared}
                onClick={() => setBrush({ shared: !brush.shared })}
                title="Your drawings are private unless this is on. Click a drawing later to show or hide it."
                className={clsx('flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold', brush.shared ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800')}
              >
                {brush.shared ? <Eye size={13} /> : <EyeOff size={13} />} {brush.shared ? 'Players see it' : 'Only you'}
              </button>
            </>
          )}
        </div>
      )}
      {tool === 'fog' && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-700/80 bg-stone-950/90 p-1 text-xs shadow-lg backdrop-blur">
          {[true, false].map((r) => (
            <button
              key={String(r)}
              type="button"
              onClick={() => setBrush({ fogReveal: r })}
              className={clsx('rounded-md px-2.5 py-1.5 font-semibold', brush.fogReveal === r ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800')}
            >
              {r ? 'Reveal' : 'Hide'}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-stone-700" />
          {[1, 3, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBrush({ fogSize: n })}
              className={clsx('rounded-md px-2 py-1.5', brush.fogSize === n ? 'bg-stone-700 text-stone-50' : 'text-stone-400 hover:bg-stone-800')}
              aria-label={`Brush ${n} squares`}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
