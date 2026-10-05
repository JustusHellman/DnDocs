import type { DndStats } from '../../types';
import { Markdown } from './Markdown';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function modifier(score: number | string | undefined) {
  const n = Number(score);
  const mod = Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function Line({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-semibold text-amber-300/90">{label}</span> <span className="text-stone-300">{value}</span>
    </div>
  );
}

/** A compact D&D-style stat block. */
export function StatBlock({ stats, text }: { stats?: DndStats | null; text?: string | null }) {
  if (!stats && !text) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-b from-amber-950/20 to-stone-950/40 text-sm">
      {stats && (
        <div className="space-y-3 p-4">
          <div className="space-y-0.5">
            <Line label="Armor Class" value={stats.armorClass} />
            <Line label="Hit Points" value={stats.hitPoints} />
            <Line label="Speed" value={stats.speed} />
          </div>
          <div className="grid grid-cols-3 gap-2 border-y border-amber-900/40 py-3 text-center @md:grid-cols-6">
            {ABILITIES.map((a) => (
              <div key={a}>
                <div className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">{a}</div>
                <div className="font-semibold text-stone-100">
                  {stats[a] ?? 10} <span className="font-normal text-stone-400">({modifier(stats[a])})</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            <Line label="Skills" value={stats.skills} />
            <Line label="Senses" value={stats.senses} />
            <Line label="Languages" value={stats.languages} />
            <Line label="Challenge" value={stats.challenge} />
            <Line label="Proficiency Bonus" value={stats.proficiencyBonus} />
          </div>
        </div>
      )}
      {text && (
        <div className={stats ? 'border-t border-amber-900/40 p-4' : 'p-4'}>
          <Markdown source={text} className="prose-sm" />
        </div>
      )}
    </div>
  );
}
