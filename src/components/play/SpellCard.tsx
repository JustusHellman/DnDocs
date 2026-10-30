import { useState } from 'react';
import clsx from 'clsx';
import { PenLine } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { saveSpellNote } from '../../lib/play/live';
import { Brain, Clock, Crosshair, Hourglass, Ruler, Sparkles } from 'lucide-react';
import { abilityName, areaLabel, dmgAt, healAt, type Spell } from '../../lib/play/spells';
import { COLORINGS, legend, setColoring, spellTone, useColoring } from '../../lib/play/coloring';
import { ordinal } from '../../lib/play/model';

export const levelLine = (sp: Spell) => (sp.l === 0 ? `${sp.s} cantrip` : `${ordinal(sp.l)}-level ${sp.s.toLowerCase()}`);
export const sourceLine = (sp: Spell, edition: string, names?: Record<string, string>) =>
  sp.xs ? `${sp.ref ?? 'Sourcebook'}${sp.nb !== undefined ? ` · description last edited by ${names?.[sp.nb] ?? 'someone at the table'}` : ' · text in the book'}` : sp.by !== undefined ? `Campaign card${names?.[sp.by] ? ` by ${names[sp.by]}` : ''}${sp.ref ? ` · ${sp.ref}` : ''}` : `${edition === '2024' ? 'SRD 5.2.1' : 'SRD 5.1'} · CC-BY-4.0`;

/** Little badges: concentration, ritual, always prepared, free uses. */
export function SpellTags({ sp, always, free }: { sp: Spell; always?: boolean; free?: string | null }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sp.k && (
        <span className="chip text-sky-300 ring-sky-500/40" title="Concentration">
          <Brain size={10} /> Conc
        </span>
      )}
      {sp.ri && (
        <span className="chip text-emerald-300 ring-emerald-500/40" title="Can be cast as a ritual (no slot, 10 minutes longer)">
          Ritual
        </span>
      )}
      {always && (
        <span className="chip text-amber-300 ring-amber-500/40" title="Always prepared: doesn't count against your prepared spells">
          Always
        </span>
      )}
      {free && (
        <span className="chip text-violet-300 ring-violet-500/40" title="Can be cast without a slot">
          <Sparkles size={10} /> {free}
        </span>
      )}
    </span>
  );
}

/**
 * A spell as a card. `mini`: the hand of cards (name, level, the key facts); otherwise the whole
 * text. Card colour by level.
 */
export default function SpellCard({
  sp,
  mini,
  charLevel = 1,
  edition = '2014',
  always,
  free,
  names,
  onClick,
  selected,
  actions,
  mod,
}: {
  sp: Spell;
  mini?: boolean;
  charLevel?: number;
  edition?: string;
  always?: boolean;
  free?: string | null;
  names?: Record<string, string>;
  onClick?: () => void;
  selected?: boolean;
  actions?: React.ReactNode;
  /** The caster's spellcasting modifier ("heals 1d8 + 4" instead of "+ mod"). */
  mod?: number;
}) {
  const tone = spellTone(sp, useColoring());
  const dmg = dmgAt(sp, sp.l || 1, charLevel);
  const heal = healAt(sp, sp.l || 1);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onClick()) : undefined}
      className={clsx(
        'relative flex flex-col overflow-hidden rounded-lg border-2 bg-stone-900 text-left shadow-md transition',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg',
        selected && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-900',
        mini ? 'min-h-36' : '',
      )}
      style={{ borderColor: tone }}
    >
      <div className="px-2.5 py-1.5 text-white" style={{ background: tone }}>
        <div className={clsx('font-display leading-tight font-semibold', mini ? 'text-sm' : 'text-lg')}>{sp.n}</div>
        <div className="text-[10px] tracking-wide uppercase opacity-90">{levelLine(sp)}</div>
      </div>
      <div className={clsx('flex flex-1 flex-col gap-1.5 px-2.5 py-2', mini ? 'text-[11px]' : 'text-sm')}>
        <div className={clsx('grid gap-x-2 gap-y-0.5 text-stone-300', mini ? 'grid-cols-1' : 'grid-cols-2')}>
          <span className="flex items-center gap-1">
            <Clock size={11} className="shrink-0 text-stone-500" /> {sp.t}
          </span>
          <span className="flex items-center gap-1">
            <Ruler size={11} className="shrink-0 text-stone-500" /> {sp.r}
            {sp.a && !mini ? ` · ${areaLabel(sp.a)}` : ''}
          </span>
          {!mini && (
            <>
              <span className="flex items-center gap-1">
                <Hourglass size={11} className="shrink-0 text-stone-500" /> {sp.d}
              </span>
              <span className="text-stone-400">
                {sp.v.split('').join(', ')}
                {sp.m ? ` (${sp.m})` : ''}
              </span>
            </>
          )}
        </div>
        {(dmg || heal || sp.sv || sp.at) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-stone-200">
            {sp.at && (
              <span className="flex items-center gap-1">
                <Crosshair size={11} /> {sp.at} attack
              </span>
            )}
            {sp.sv && <span>{abilityName(sp.sv)} save{sp.sh === 'half' ? ' (half)' : ''}</span>}
            {dmg && (
              <span>
                {dmg} {sp.dm?.ty?.toLowerCase()}
              </span>
            )}
            {heal && <span className="text-emerald-300">heals {mod === undefined ? heal.replace('MOD', 'mod') : heal.replace(/\s*\+\s*MOD/, mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : '')}</span>}
          </div>
        )}
        <SpellTags sp={sp} always={always} free={free} />
        {!mini && (
          <>
            {sp.xs ? (
              <SpellNote sp={sp} />
            ) : sp.x ? (
              <div className="max-h-[40vh] overflow-y-auto pr-1 text-[13px] leading-relaxed whitespace-pre-wrap text-stone-300">{sp.x}</div>
            ) : null}
            {sp.h && (
              <div className="text-[13px] leading-relaxed text-stone-300">
                <b className="text-stone-200">At higher levels. </b>
                {sp.h}
              </div>
            )}
          </>
        )}
        <div className="mt-auto flex items-end gap-2 pt-1">
          <span className="flex-1 text-[9px] text-stone-500">{sourceLine(sp, edition, names)}</span>
          {actions}
        </div>
      </div>
    </div>
  );
}

/** "Colour by: Level / School / Casting time / Effect", with what the colours mean. */
export function ColoringPicker() {
  const mode = useColoring();
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
      <label className="flex items-center gap-1">
        Colour by
        <select className="rounded border border-stone-700 bg-stone-950 px-1 py-0.5 text-xs text-stone-200" value={mode} onChange={(e) => setColoring(e.target.value as typeof mode)} aria-label="Colour the cards by">
          {COLORINGS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {legend(mode).map((l) => (
        <span key={l.label} className="flex items-center gap-1">
          <span className="size-2.5 rounded-full" style={{ background: l.tone }} />
          {l.label}
        </span>
      ))}
    </span>
  );
}

/**
 * A spell from another book comes without its text: anyone at the table can write what it does in
 * their own words (kept for the campaign, everyone sees it). The writer and the DM can change it.
 */
function SpellNote({ sp }: { sp: Spell }) {
  const { user, currentCampaign } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [x, setX] = useState(sp.x ?? '');
  const [h, setH] = useState(sp.h ?? '');
  const [busy, setBusy] = useState(false);
  // Anyone at the table may write or improve a description; it remembers who changed it last.
  const mayEdit = !!user;
  const save = async () => {
    if (!currentCampaign || !user) return;
    setBusy(true);
    try {
      await saveSpellNote(currentCampaign.id, sp, user.uid, x, h);
      setEditing(false);
    } catch (err) {
      toast.error(err, 'Save description');
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
        <textarea className="input min-h-28 text-[13px]" value={x} onChange={(e) => setX(e.target.value.slice(0, 2500))} placeholder={`What ${sp.n} does, in your own words`} aria-label="Description" autoFocus />
        <input className="input py-1 text-[13px]" value={h} onChange={(e) => setH(e.target.value.slice(0, 600))} placeholder="At higher levels (optional)" aria-label="At higher levels" />
        <div className="flex justify-end gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setEditing(false), setX(sp.x ?? ''), setH(sp.h ?? ''))}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
            Save for the campaign
          </button>
        </div>
      </div>
    );
  return (
    <div className="space-y-1.5">
      {sp.x ? (
        <div className="max-h-[40vh] overflow-y-auto pr-1 text-[13px] leading-relaxed whitespace-pre-wrap text-stone-300">{sp.x}</div>
      ) : (
        <p className="rounded-md bg-stone-950/50 px-2 py-1.5 text-[12px] text-stone-400 italic">Not in the free rules: what it does is in {sp.ref ?? 'its book'}. The numbers above are here so you can cast it.</p>
      )}
      {mayEdit && (
        <button
          type="button"
          className="flex items-center gap-1 text-[12px] font-semibold text-amber-400 hover:text-amber-300"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <PenLine size={12} /> {sp.x ? 'Edit the description' : 'Write what it does (your own words)'}
        </button>
      )}
    </div>
  );
}
