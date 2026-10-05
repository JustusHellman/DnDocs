import type { DndStats } from '../../types';
import { EMPTY_STATS } from '../../lib/entityService';
import { ABILITIES, modifier } from '../entity/StatBlock';
import MarkdownField from './MarkdownField';

interface Props {
  stats: DndStats | null | undefined;
  text: string;
  onStats: (stats: DndStats) => void;
  onText: (text: string) => void;
}

const TEXT_FIELDS: { key: keyof DndStats; label: string; placeholder: string }[] = [
  { key: 'armorClass', label: 'Armor class', placeholder: '16 (chain shirt, shield)' },
  { key: 'hitPoints', label: 'Hit points', placeholder: '11 (2d8 + 2)' },
  { key: 'speed', label: 'Speed', placeholder: '30 ft.' },
  { key: 'skills', label: 'Skills', placeholder: 'Perception +2' },
  { key: 'senses', label: 'Senses', placeholder: 'Passive Perception 12' },
  { key: 'languages', label: 'Languages', placeholder: 'Common, Elvish' },
  { key: 'challenge', label: 'Challenge', placeholder: '1/8 (25 XP)' },
  { key: 'proficiencyBonus', label: 'Proficiency bonus', placeholder: '+2' },
];

export default function StatBlockEditor({ stats, text, onStats, onText }: Props) {
  const s = { ...EMPTY_STATS, ...(stats ?? {}) };
  const set = (key: keyof DndStats, value: string | number) => onStats({ ...s, [key]: value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ABILITIES.map((a) => (
          <label key={a} className="surface flex flex-col items-center gap-1 p-2">
            <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">{a}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={s[a]}
              onChange={(e) => set(a, e.target.value === '' ? 10 : Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))}
              className="w-14 rounded-md border border-stone-700 bg-stone-900 py-1 text-center text-lg font-semibold text-stone-100 outline-none focus:border-amber-500"
            />
            <span className="text-xs text-stone-400">{modifier(s[a])}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`sb-${f.key}`}>
              {f.label}
            </label>
            <input id={`sb-${f.key}`} className="input" value={String(s[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <div>
        <span className="label">Actions, traits &amp; reactions</span>
        <MarkdownField value={text} onChange={onText} height={220} entityLinks={false} placeholder="***Multiattack.*** The creature makes two attacks…" />
      </div>
    </div>
  );
}
