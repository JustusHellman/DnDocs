import { Crosshair, Eye, EyeOff, MapPin, X } from 'lucide-react';
import type { Ruler, Tool } from '../../components/battle/BattleBoard';
import type { TokenSpec } from '../../components/battle/AddTokens';
import { distanceFeet } from '../../lib/battle/geometry';
import type { CastArea } from '../../lib/play/ui';
import type { Drawing, SceneGrid } from '../../types';

/**
 * What the battle map tells you over the map: picking a target, placing a spell's area or tokens,
 * the tool that's on (and how to stop it), the ruler's distance, a drawing you picked.
 */
export default function MapHints({
  picking,
  onCancelPicking,
  drawing,
  drawingBy,
  isDM,
  onCloseDrawing,
  onShareDrawing,
  onDeleteDrawing,
  ruler,
  rulerFollowing,
  grid,
  tool,
  onToolDone,
  casting,
  onCancelCasting,
  armed,
  onCancelArmed,
}: {
  picking: { byName: string } | null;
  onCancelPicking: () => void;
  drawing: Drawing | null;
  drawingBy: (d: Drawing) => string;
  isDM: boolean;
  onCloseDrawing: () => void;
  onShareDrawing: (d: Drawing) => void;
  onDeleteDrawing: (d: Drawing) => void;
  ruler: Ruler | null;
  rulerFollowing: boolean;
  grid: SceneGrid;
  /** The tool that's on ('select': no tool pill). */
  tool: Tool;
  onToolDone: () => void;
  casting: CastArea | null;
  onCancelCasting: () => void;
  armed: TokenSpec | null;
  onCancelArmed: () => void;
}) {
  return (
    <>
      {picking && (
        <div className="absolute inset-x-2 top-14 z-10 flex items-center gap-2 rounded-lg border border-rose-400/60 bg-stone-950/95 px-3 py-2 text-sm text-rose-100 shadow-lg backdrop-blur sm:top-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
          <Crosshair size={16} className="shrink-0 text-rose-300" />
          <span className="flex-1">
            Click the token <strong>{picking.byName}</strong> targets <span className="text-stone-400">· nothing else happens · Esc to cancel</span>
          </span>
          <button type="button" className="btn-icon-sm" aria-label="Cancel picking a target" onClick={onCancelPicking}>
            <X size={15} />
          </button>
        </div>
      )}
      {drawing && (
        <div className="absolute bottom-2 left-2 w-72 rounded-xl border border-stone-700/80 bg-stone-950/95 p-3 text-sm shadow-2xl backdrop-blur pb-safe">
          <div className="flex items-center gap-2">
            <span className="size-4 shrink-0 rounded-full ring-2 ring-stone-700" style={{ background: drawing.color }} />
            <span className="flex-1 font-semibold text-stone-100">{drawingBy(drawing)}</span>
            <button type="button" className="btn-icon-sm" aria-label="Close" onClick={onCloseDrawing}>
              <X size={15} />
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-400">Drag it to move it. {isDM && <>{drawing.shared ? 'Players can see it.' : 'Only you can see it.'} Right-click a drawing to switch quickly.</>}</p>
          <div className="mt-2 flex gap-1.5">
            {isDM && (
              <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => onShareDrawing(drawing)}>
                {drawing.shared ? <EyeOff size={13} /> : <Eye size={13} />} {drawing.shared ? 'Hide from players' : 'Show to players'}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm text-rose-300" onClick={() => onDeleteDrawing(drawing)}>
              Delete
            </button>
          </div>
        </div>
      )}
      {ruler && ruler.pts.length > 1 && ruler.label !== '0 ft' && (
        // The measurement, big and the same size at any zoom: when you measure, it's the number you want.
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 sm:top-3" aria-live="polite">
          <div className="flex flex-col items-center rounded-2xl border border-stone-600/70 bg-stone-950/92 px-5 py-2 text-center shadow-2xl backdrop-blur">
            <div className="font-display text-4xl leading-tight font-bold text-stone-50 tabular-nums">{ruler.label}</div>
            <div className="text-sm text-stone-400 tabular-nums">
              {(() => {
                const legs = ruler.pts
                  .slice(1)
                  .map((p, i) => distanceFeet(ruler.pts[i], p, grid))
                  .filter((ft) => ft > 0);
                const ft = legs.reduce((a, b) => a + b, 0);
                const squares = Math.round(ft / (grid.feet || 5));
                return `${squares} square${squares === 1 ? '' : 's'}${legs.length > 1 ? ` · ${legs.join(' + ')} ft` : ''}`;
              })()}
            </div>
            {rulerFollowing && <div className="mt-0.5 text-xs text-stone-500">Click to turn · right-click: undo a turn · double-click: done · Esc: stop</div>}
          </div>
        </div>
      )}
      {/* Any tool but "select": how to stop using it (Escape, or this button on a touch screen). */}
      {tool !== 'select' && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-stone-600/70 bg-stone-950/92 py-1 pr-1 pl-3 text-xs text-stone-300 shadow-lg backdrop-blur">
          <span>
            {{ measure: 'Measuring', draw: 'Drawing', ping: 'Pinging', erase: 'Erasing', fog: 'Painting fog' }[tool as string] ?? 'Tool on'}
            <span className="hidden text-stone-500 sm:inline"> · Esc to stop</span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm min-h-7 rounded-full px-2.5" onClick={onToolDone}>
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
          <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={onCancelCasting}>
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
          <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={onCancelArmed}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
