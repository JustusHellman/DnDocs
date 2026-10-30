import { useState } from 'react';
import clsx from 'clsx';
import { Brain, Calculator, ChevronDown, ChevronUp, Coffee, Heart, Moon, Sparkles, Swords, Undo2, Wand2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { ChatMessage } from '../../lib/chat/service';
import type { TableEvent } from '../../lib/chat/events';
import { tableChat } from '../../lib/chat/bus';
import { patchPlay, tableLive, useTableLive } from '../../lib/play/live';
import { useSpellIndex } from '../../lib/play/ui';
import { LEVEL_TONE } from '../../lib/play/spells';
import { tint } from '../../lib/chat/colors';
import SpellCard from '../play/SpellCard';
import RollField, { type RollOutcome } from '../play/RollField';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Something that happened at the table, as a line (or a small card) in the chat. */
export default function EventLine({ m, ev, color, mine }: { m: ChatMessage; ev: TableEvent; color: string; mine: boolean }) {
  const { isDM, currentCampaign } = useAuth();
  const toast = useToast();
  const cid = currentCampaign?.id;
  const line = (icon: React.ReactNode, body: React.ReactNode, extra?: React.ReactNode) => (
    <div className="flex items-start gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-stone-300" style={{ background: tint(color, 0.06) }}>
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">{body}</span>
      {extra}
      <span className="shrink-0 pt-0.5 text-[10px] text-stone-500">{time(m.at)}</span>
    </div>
  );
  const Who = ({ n }: { n: string }) => (
    <b className="font-semibold" style={{ color }}>
      {n}
    </b>
  );

  switch (ev.t) {
    case 'cast':
      return <CastLine m={m} ev={ev} color={color} />;
    case 'castres':
      return line(
        <Wand2 size={13} />,
        <>
          <Who n={ev.who} />’s {ev.spell}: {ev.parts.map((p, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {p.l} <b className="text-amber-300 tabular-nums">{p.v}</b>
            </span>
          ))}
          <span className="text-[11px] text-stone-500"> (rolled at the table)</span>
        </>,
      );
    case 'use': {
      const canUndo = !!ev.undo && (mine || isDM);
      return line(
        ev.back ? <Heart size={13} /> : <Sparkles size={13} />,
        <>
          <Who n={ev.who} /> {ev.back ? 'got back' : 'used'} {ev.what}{' '}
          <span className="text-stone-500">
            ({ev.left} of {ev.of} left)
          </span>
        </>,
        canUndo && cid ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] text-stone-400 hover:bg-stone-800 hover:text-stone-100"
            title="Put it back as it was and take this line out"
            onClick={async () => {
              try {
                const u = ev.undo!;
                const cur = tableLive().play[u.key];
                await patchPlay(cid, u.key, cur?.uid ?? m.uid, cur?.name ?? ev.who, { [u.path]: u.was || null });
                await tableChat.remove(m.id);
              } catch (err) {
                toast.error(err, 'Undo');
              }
            }}
          >
            <Undo2 size={11} /> Undo
          </button>
        ) : null,
      );
    }
    case 'conc':
      return <ConcCheck m={m} ev={ev} color={color} />;
    case 'concres':
      return line(
        <Brain size={13} />,
        <>
          <Who n={ev.who} /> {ev.kept ? 'keeps concentrating' : 'loses concentration'}
          {ev.total !== undefined && <span className="text-stone-500"> (save {ev.total})</span>}
        </>,
      );
    case 'concon':
      return line(
        <Brain size={13} />,
        <>
          <Who n={ev.who} /> {ev.on ? `is concentrating${ev.spell ? ` on ${ev.spell}` : ''}` : 'stops concentrating'}
        </>,
      );
    case 'rest':
      return line(
        ev.kind === 'long' ? <Moon size={13} /> : <Coffee size={13} />,
        <>
          <Who n={ev.who} /> {ev.party ? `takes a ${ev.kind} rest together` : `took a ${ev.kind} rest`}
          {(ev.hp || ev.hd) && <span className="text-stone-500"> · {[ev.hp, ev.hd].filter(Boolean).join(' · ')}</span>}
        </>,
      );
    case 'hd':
      return line(
        <Heart size={13} />,
        <>
          <Who n={ev.who} /> spent a hit die (d{ev.die}): <b className="text-emerald-300">+{ev.total} HP</b> <span className="text-stone-500">→ {ev.hp}</span>
        </>,
      );
    case 'math':
      return line(
        <Calculator size={13} />,
        <>
          <Who n={m.name} /> <span className="font-mono text-xs text-stone-400">{ev.expr}</span> = <b className="text-amber-300 tabular-nums">{ev.total}</b>
          {ev.half !== undefined && <span className="text-stone-500"> · half {ev.half}</span>}
        </>,
      );
    case 'me':
      return (
        <div className="px-1.5 text-[13px] text-stone-300 italic">
          <Who n={m.name} /> {ev.text}
        </div>
      );
    case 'init':
      return line(
        <Swords size={13} />,
        <>
          <Who n={ev.who} /> initiative <b className="text-amber-300 tabular-nums">{ev.total}</b>
          {!ev.rolled && <span className="text-stone-500"> (rolled at the table)</span>}
        </>,
      );
  }
}

function CastLine({ m, ev, color }: { m: ChatMessage; ev: Extract<TableEvent, { t: 'cast' }>; color: string }) {
  const [open, setOpen] = useState(false);
  const { currentCampaign } = useAuth();
  const edition = currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014';
  const index = useSpellIndex(edition);
  const sp = open ? index.byId.get(ev.id) : undefined;
  const tone = LEVEL_TONE[ev.lvl] ?? LEVEL_TONE[0];
  return (
    <div className="overflow-hidden rounded-lg border border-l-[3px] border-stone-700/70 bg-stone-900/80" style={{ borderLeftColor: color }}>
      <button type="button" className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-white" style={{ background: tone }}>
          <Wand2 size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-stone-200">
            <b style={{ color }}>{ev.who}</b> casts <b className="text-stone-50">{ev.spell}</b>
            {ev.conc && <Brain size={12} className="ml-1 inline text-sky-300" aria-label="concentration" />}
          </span>
          <span className="block text-[11px] text-stone-400">
            {/level slot$/.test(ev.via) ? '' : `${ev.via} · `}
            {ev.sum}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[10px] text-stone-500">{time(m.at)}</span>
          {open ? <ChevronUp size={13} className="text-stone-500" /> : <ChevronDown size={13} className="text-stone-500" />}
        </span>
      </button>
      {open && <div className="px-2 pb-2">{sp ? <SpellCard sp={sp} edition={edition} charLevel={20} /> : <p className="text-xs text-stone-500">{index.loading ? 'Opening…' : 'This card isn’t in the campaign’s rules.'}</p>}</div>}
    </div>
  );
}

/** Took damage while concentrating: the owner (and the DM) can roll the save here, type it, or just say how it went. */
function ConcCheck({ m, ev, color }: { m: ChatMessage; ev: Extract<TableEvent, { t: 'conc' }>; color: string }) {
  const { user, isDM, currentCampaign } = useAuth();
  const toast = useToast();
  const live = useTableLive();
  const [save, setSave] = useState<RollOutcome | null>(null);
  const [done, setDone] = useState(false);
  const stillOn = !!live.play[ev.key]?.conc;
  const mineToAnswer = (user?.uid === ev.owner || isDM) && stillOn && !done && Date.now() - m.at < 30 * 60_000;
  const answer = async (kept: boolean) => {
    if (!currentCampaign) return;
    setDone(true);
    try {
      if (save?.roll) tableChat.roll(save.roll);
      if (!kept) await patchPlay(currentCampaign.id, ev.key, live.play[ev.key]?.uid ?? ev.owner, ev.who, { conc: null, cs: null });
      await tableChat.event({ t: 'concres', who: ev.who, kept, ...(save ? { total: save.total } : {}) });
    } catch (err) {
      toast.error(err, 'Concentration');
    }
  };
  const verdict = save ? save.total >= ev.dc : null;
  return (
    <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[13px] text-stone-200">
      <div className="flex items-start gap-1.5">
        <Brain size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <span className="flex-1">
          <b style={{ color }}>{ev.who}</b> took {ev.dmg} damage while concentrating: <b>Constitution save DC {ev.dc}</b> <span className="text-stone-400">({signed(ev.con)})</span>
        </span>
        <span className="text-[10px] text-stone-500">{time(m.at)}</span>
      </div>
      {mineToAnswer && (
        <div className={clsx('mt-1.5 space-y-1.5')}>
          <RollField compact label="CON save" formula={`1d20${signed(ev.con)}`} value={save} onChange={setSave} />
          <div className="flex items-center justify-end gap-1.5">
            {verdict !== null && <span className={clsx('mr-auto text-xs font-semibold', verdict ? 'text-emerald-300' : 'text-rose-300')}>{verdict ? 'Made it' : 'Missed it'}</span>}
            <button type="button" className={clsx('btn btn-sm', verdict === false ? 'btn-secondary' : 'btn-primary')} onClick={() => answer(true)}>
              Kept it
            </button>
            <button type="button" className={clsx('btn btn-sm', verdict === false ? 'btn-primary' : 'btn-secondary')} onClick={() => answer(false)}>
              Lost it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
