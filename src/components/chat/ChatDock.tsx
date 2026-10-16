import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Dices, EyeOff, GripHorizontal, MessageSquare, Send, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsPhone } from '../../hooks/useMediaQuery';
import { chatAvailable, listenChat, listenColors, sendRoll, sendText, setTableColor, syncChatRoom, type ChatMessage, type ChatStatus } from '../../lib/chat/service';
import { pickColor, shouldRepick, tint } from '../../lib/chat/colors';
import { colorOf, colorsLoaded, setColorsSnapshot, useTableColors } from '../../lib/chat/colorStore';
import ColorPicker from './ColorPicker';
import InitiativePanel from './InitiativePanel';
import { useInitiativeContext } from '../../lib/battle/initiativeStore';
import { parseRollCommand, rollCommand, toChatRoll, type ChatRoll } from '../../lib/chat/rolls';
import type { RollResult } from '../../lib/dice';
import DiceTray from '../dice/DiceTray';
import DiceToss from './DiceToss';

/** Open the table chat from anywhere (e.g. the battle map's dice button): `{ dice: true }` opens the dice too. */
export function openTableChat(opts: { dice?: boolean; toggle?: boolean; initiative?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent('dndocs:chat', { detail: opts }));
}

const seenKey = (cid: string, uid: string) => `dndocs-chat-seen:${cid}:${uid}`;
const showKey = (cid: string) => `dndocs-chat-dm-show:${cid}`;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const posKey = 'dndocs-chat-pos';
const PANEL_W = 416; // 26rem at the default font size; measured for real when dragging
const sameRoll = (a: ChatRoll | undefined, b: ChatRoll | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** Where the floating chat sits (top-left corner, px), remembered between visits. null: the default top-right spot. */
function useChatPosition(panel: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const p = JSON.parse(read(posKey) || 'null') as { x: number; y: number } | null;
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch {
      return null;
    }
  });
  const clamp = useCallback(
    (p: { x: number; y: number }) => {
      const el = panel.current;
      const w = el?.offsetWidth ?? PANEL_W;
      const h = el?.offsetHeight ?? 400;
      return { x: Math.max(4, Math.min(window.innerWidth - w - 4, p.x)), y: Math.max(4, Math.min(window.innerHeight - h - 4, p.y)) };
    },
    [panel],
  );
  // Keep it on screen when the window shrinks.
  useEffect(() => {
    if (!pos) return;
    const on = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [pos, clamp]);
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const el = panel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    const move = (ev: PointerEvent) => {
      last = clamp({ x: ev.clientX - dx, y: ev.clientY - dy });
      setPos(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      write(posKey, JSON.stringify(last));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  const reset = () => {
    setPos(null);
    try {
      localStorage.removeItem(posKey);
    } catch {
      /* ignore */
    }
  };
  return { pos, startDrag, reset };
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The table chat: messages and dice in one place, on every page of the campaign. Everyone sees
 * players' rolls; the DM's rolls stay behind the screen unless the DM switches that off. Lives in
 * the Realtime Database (no Firestore reads or writes). Without it set up, the dice still roll,
 * just for you.
 */
export function ChatButton() {
  const { user, currentCampaign, isDM } = useAuth();
  const { entities, members } = useCampaignData();
  const colors = useTableColors();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(true);
  const initCtx = useInitiativeContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [text, setText] = useState('');
  const [toss, setToss] = useState<ChatRoll | null>(null);
  const tossKey = useRef(0);
  // Your own roll's card keeps its number hidden until the dice on screen have landed.
  const [landed, setLanded] = useState(true);
  const [pops, setPops] = useState<ChatMessage[]>([]);
  const popped = useRef(new Set<string>());
  const panel = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const { pos, startDrag, reset } = useChatPosition(panel);
  const cid = currentCampaign?.id;
  const uid = user?.uid;
  const [showDmRolls, setShowDmRolls] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const mountedAt = useRef(Date.now());
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cid || !uid) return;
    setShowDmRolls(read(showKey(cid)) === '1');
    setSeenAt(Number(read(seenKey(cid, uid)) || 0));
    setLocal([]);
    return listenChat(cid, isDM, setMessages, setStatus);
  }, [cid, uid, isDM]);

  // Table colours: one live list for the campaign, shared with the map and the members page.
  const ready = status === 'ready';
  useEffect(() => {
    setColorsSnapshot({}, false);
    if (!cid || !ready) return;
    return listenColors(cid, setColorsSnapshot);
  }, [cid, ready]);
  // No colour yet (or the same one as someone who picked at the same moment): take a free one.
  useEffect(() => {
    if (!cid || !uid || !ready || !colorsLoaded()) return;
    if (colors[uid] && !shouldRepick(uid, colors)) return;
    // A moment's grace: others' colours (and a second tab of yours) settle first.
    const t = setTimeout(() => {
      const next = { ...colors };
      if (shouldRepick(uid, next)) delete next[uid];
      setTableColor(cid, uid, pickColor(uid, next, currentCampaign?.dmId === uid)).catch(() => undefined);
    }, 1200);
    return () => clearTimeout(t);
  }, [cid, uid, ready, colors]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => Object.fromEntries(members.map((m) => [m.uid, m.displayName])), [members]);

  // The owner's app keeps the chat's member list in step with the campaign.
  const memberKey = currentCampaign ? [currentCampaign.dmId, ...(currentCampaign.coDms ?? []), '|', ...(currentCampaign.players ?? [])].join(',') : '';
  useEffect(() => {
    if (currentCampaign && uid) syncChatRoom(currentCampaign, uid);
  }, [cid, uid, memberKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from elsewhere (the battle map's dice button, R).
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ dice?: boolean; toggle?: boolean; initiative?: boolean }>).detail ?? {};
      setOpen((o) => (d.toggle ? !o : true));
      if (d.dice) setDiceOpen(true);
      if (d.initiative) setInitOpen(true);
    };
    window.addEventListener('dndocs:chat', on);
    return () => window.removeEventListener('dndocs:chat', on);
  }, []);

  const all = useMemo(() => [...messages, ...local].sort((a, b) => a.at - b.at), [messages, local]);
  // The badge counts messages; rolls get their own little pop-ups instead.
  const unread = open ? 0 : all.filter((m) => m.kind === 'text' && m.at > seenAt && m.uid !== uid).length;
  // Someone else rolled while the chat is closed: a pop-up for a few seconds.
  useEffect(() => {
    const fresh = messages.filter((m) => m.kind !== 'text' && m.uid !== uid && m.at > mountedAt.current && !popped.current.has(m.id));
    fresh.forEach((m) => popped.current.add(m.id));
    if (open || !fresh.length) return;
    setPops((p) => [...p, ...fresh].slice(-4));
    const ids = new Set(fresh.map((m) => m.id));
    const t = setTimeout(() => setPops((p) => p.filter((m) => !ids.has(m.id))), 6000);
    return () => clearTimeout(t);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) setPops([]);
  }, [open]);
  useEffect(() => {
    if (!open || !cid || !uid) return;
    const last = all.length ? all[all.length - 1].at : Date.now();
    setSeenAt(last);
    write(seenKey(cid, uid), String(last));
  }, [open, all.length, cid, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the newest message in view.
  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, all.length, diceOpen]);

  // Your own character's abilities, for one-tap checks in the dice.
  const stats = useMemo(() => (isDM ? null : entities.find((e) => e.type === 'character' && e.playerId === uid)?.dndStats ?? null), [entities, isDM, uid]);

  const shared = status === 'ready';
  const hiddenRoll = isDM && !showDmRolls;
  const doRoll = useCallback(
    (roll: ChatRoll) => {
      tossKey.current += 1;
      setToss(roll);
      setLanded(false);
      if (!cid || !user) return;
      if (!shared) {
        // No chat yet: the roll is still shown here, just for you.
        setLocal((l) => [...l, { id: `local-${Date.now()}`, uid: user.uid, name: user.displayName, at: Date.now(), kind: 'roll', roll, ...(hiddenRoll ? { secret: true } : {}) }]);
        return;
      }
      sendRoll(cid, user, roll, hiddenRoll).catch((err) => toast.error(err, 'Share roll'));
    },
    [cid, user, shared, hiddenRoll, toast],
  );
  const onTrayRoll = (r: RollResult, label?: string) => doRoll(toChatRoll(r, label));
  /** A line in your own chat only (not sent anywhere). */
  const note = (text: string) => user && setLocal((l) => [...l, { id: `note-${Date.now()}`, uid: user.uid, name: user.displayName, at: Date.now(), kind: 'text', text, secret: true }]);

  const send = () => {
    const t = text.trim();
    if (!t || !cid || !user) return;
    const cmd = parseRollCommand(t);
    setText('');
    if (cmd) return doRoll(rollCommand(cmd));
    if (!shared) return toast.show(status === 'waiting' ? 'The chat opens for you once the DM has had DnDocs open since you joined.' : 'The table chat isn’t set up yet, so only dice work for now.');
    sendText(cid, user, t).catch((err) => toast.error(err, 'Send message'));
  };

  if (!cid || !uid) return null;
  return (
    <>
      <button type="button" className="btn-icon relative" aria-label={`Table chat and dice${unread ? ` (${unread} new)` : ''}`} title="Table chat and dice" onClick={() => setOpen((o) => !o)}>
        <MessageSquare size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          className={clsx(
            'fixed z-40 flex flex-col overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/97 shadow-2xl backdrop-blur',
            // Phones: a sheet above the bottom bar. Bigger screens: a floating window you can drag around.
            phone ? 'inset-x-2 top-16 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]' : 'h-[min(78vh,46rem)] w-[min(26rem,calc(100vw-1rem))]',
            !phone && !pos && 'top-[4.5rem] right-2',
          )}
          style={!phone && pos ? { left: pos.x, top: pos.y } : undefined}
        >
          <div
            className={clsx('flex items-center gap-2 border-b border-stone-800 px-3 py-2', !phone && 'cursor-grab touch-none select-none active:cursor-grabbing')}
            onPointerDown={phone ? undefined : startDrag}
            onDoubleClick={phone ? undefined : (e) => !(e.target as HTMLElement).closest('button') && reset()}
            title={phone ? undefined : 'Drag to move (double-click to put it back)'}
          >
            {phone ? <MessageSquare size={16} className="text-amber-400" /> : <GripHorizontal size={16} className="text-stone-500" />}
            <span className="font-semibold text-stone-100">Table</span>
            {ready && <ColorPicker campaignId={cid} uid={uid} canEdit names={names} />}
            <span className="flex-1" />
            {isDM && (
              <button
                type="button"
                aria-pressed={showDmRolls}
                onClick={() => {
                  setShowDmRolls((v) => !v);
                  write(showKey(cid), showDmRolls ? '0' : '1');
                }}
                title="Your rolls are hidden from the players unless this is on (they see that you rolled, not what)."
                className={clsx('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold', showDmRolls ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:bg-stone-800')}
              >
                {showDmRolls ? <Dices size={13} /> : <EyeOff size={13} />} {showDmRolls ? 'Players see my rolls' : 'Rolls hidden'}
              </button>
            )}
            <button type="button" className="btn-icon-sm" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>

          <div ref={list} className="scrollbar-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
            {status === 'unavailable' && (
              <p className="rounded-md bg-stone-900/70 p-2 text-xs text-stone-400">
                {chatAvailable ? 'The chat can’t connect right now.' : 'The table chat isn’t set up yet (the DM can do it: see the README).'} The dice still work, just for you.
              </p>
            )}
            {status === 'waiting' && <p className="rounded-md bg-stone-900/70 p-2 text-xs text-stone-400">The chat opens for you once the DM has had DnDocs open since you joined. The dice still work, just for you.</p>}
            {all.length === 0 && status === 'ready' && <p className="py-6 text-center text-sm text-stone-500">Say hello, or roll something.</p>}
            {all.map((m) => (
              <Message key={m.id} m={m} color={colorOf(colors, m.uid)} mine={m.uid === uid} fresh={m.at > mountedAt.current && m.uid !== uid} veiled={!landed && m.uid === uid && sameRoll(m.roll, toss)} />
            ))}
          </div>

          {initCtx && <InitiativePanel ctx={initCtx} open={initOpen} onToggle={() => setInitOpen((o) => !o)} share={doRoll} note={note} />}
          {diceOpen && (
            <div className="scrollbar-thin max-h-[45%] overflow-y-auto border-t border-stone-800 px-3 pt-2 pb-1">
              <DiceTray uid={uid} stats={stats} variant="chat" onRoll={onTrayRoll} />
            </div>
          )}
          <form
            className="flex items-center gap-1.5 border-t border-stone-800 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <button type="button" className={clsx('btn-icon shrink-0', diceOpen && 'bg-amber-500 text-stone-950 hover:bg-amber-400')} aria-pressed={diceOpen} aria-label="Dice" title="Dice" onClick={() => setDiceOpen((o) => !o)}>
              <Dices size={18} />
            </button>
            <input
              className="input min-w-0 flex-1"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              placeholder={hiddenRoll ? 'Message, or /r 1d20+5 (hidden)' : 'Message, or /r 1d20+5'}
              aria-label="Message"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={!text.trim()} aria-label="Send">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
      {toss && <DiceToss key={tossKey.current} roll={toss} avoid={open && !phone && panel.current ? panel.current.getBoundingClientRect() : null} color={colorOf(colors, uid)} onLand={() => setLanded(true)} onDone={() => (setToss(null), setLanded(true))} />}
      {pops.length > 0 && !open && (
        <div className="pointer-events-none fixed top-[4.5rem] right-3 z-40 flex w-64 flex-col gap-1.5">
          {pops.map((m) => (
            <RollPop key={m.id} m={m} color={colorOf(colors, m.uid)} onOpen={() => setOpen(true)} />
          ))}
        </div>
      )}
    </>
  );
}

/** A roll that arrived while the chat is closed: who, what for, the total. Click to open the chat. */
function RollPop({ m, color, onOpen }: { m: ChatMessage; color: string; onOpen: () => void }) {
  const r = m.roll;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="animate-pop-in pointer-events-auto flex items-center gap-2.5 rounded-lg border border-l-[3px] border-stone-700/80 bg-stone-950/95 px-3 py-1.5 text-left shadow-xl backdrop-blur hover:border-stone-500"
      style={{ borderLeftColor: color }}
    >
      {m.kind === 'hidden' || !r ? (
        <span className="flex items-center gap-1.5 text-xs text-stone-400 italic">
          <EyeOff size={12} /> {m.name} rolls behind the screen
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-stone-400">
            <span className="font-semibold" style={{ color }}>
              {m.name}
            </span>
            {r.l ? ` · ${r.l}` : ` · ${r.f}`}
            {m.secret ? ' · secret' : ''}
          </span>
          <span className={clsx('font-display text-2xl font-bold tabular-nums', r.nat === 20 ? 'text-emerald-300' : r.nat === 1 ? 'text-rose-400' : 'text-amber-300')}>{r.t}</span>
        </>
      )}
    </button>
  );
}

function Message({ m, color, mine, fresh, veiled }: { m: ChatMessage; color: string; mine: boolean; fresh: boolean; veiled?: boolean }) {
  if (m.kind === 'hidden')
    return (
      <div className="flex items-center gap-1.5 text-xs text-stone-500 italic">
        <EyeOff size={12} /> {m.name} rolls behind the screen · {time(m.at)}
      </div>
    );
  if (m.kind === 'roll' && m.roll) return <RollCard m={m} roll={m.roll} color={color} mine={mine} fresh={fresh} veiled={veiled} />;
  // A thin stripe and the name in their colour, and the faintest wash of it: who wrote what at a
  // glance, without turning the chat into a fairground.
  return (
    <div
      className={clsx('max-w-[90%] rounded-lg border-l-2 px-2.5 py-1.5', mine ? 'ml-auto' : '')}
      style={{ borderLeftColor: color, background: `linear-gradient(${tint(color, mine ? 0.1 : 0.06)}, ${tint(color, mine ? 0.1 : 0.06)}), rgb(41 37 36 / ${mine ? 0.55 : 0.7})` }}
    >
      {!mine && (
        <div className="text-xs font-semibold" style={{ color }}>
          {m.name}
        </div>
      )}
      <div className="text-sm break-words whitespace-pre-wrap text-stone-100">{m.text}</div>
      {m.secret && <div className="text-[10px] text-stone-500 italic">only you see this</div>}
      <div className="text-right text-[10px] text-stone-500">{time(m.at)}</div>
    </div>
  );
}

/** A roll in the chat. Rolls that just arrived spin their numbers for a moment. */
function RollCard({ m, roll, color, mine, fresh, veiled }: { m: ChatMessage; roll: ChatRoll; color: string; mine: boolean; fresh: boolean; veiled?: boolean }) {
  if (veiled) return <RollCardVeiled m={m} roll={roll} color={color} />;
  return <RollCardShown m={m} roll={roll} color={color} mine={mine} fresh={fresh} />;
}

/** Your roll while your dice are still tumbling: no spoilers. */
function RollCardVeiled({ m, roll, color }: { m: ChatMessage; roll: ChatRoll; color: string }) {
  return (
    <div className="ml-6 rounded-lg border border-l-[3px] border-stone-700/70 bg-stone-900/80 px-2.5 py-1.5" style={{ borderLeftColor: color }}>
      <div className="truncate text-xs text-stone-400">
        <span className="font-semibold" style={{ color }}>
          You
        </span>
        {roll.l ? ` · ${roll.l}` : ''} · {time(m.at)}
      </div>
      <div className="flex items-center gap-3">
        <Dices size={20} className="shrink-0 animate-spin text-stone-500" />
        <span className="font-display text-3xl font-bold text-stone-600">…</span>
        <span className="text-xs text-stone-500">{roll.f}</span>
      </div>
    </div>
  );
}

function RollCardShown({ m, roll, color, mine, fresh }: { m: ChatMessage; roll: ChatRoll; color: string; mine: boolean; fresh: boolean }) {
  const [spinning, setSpinning] = useState(fresh);
  const [shown, setShown] = useState(roll.t);
  useEffect(() => {
    if (!fresh) return;
    const max = Math.max(...roll.d.map((g) => g.s * g.v.length), 6) + Math.abs(roll.m);
    const id = setInterval(() => setShown(1 + Math.floor(Math.random() * max)), 70);
    const stop = setTimeout(() => {
      clearInterval(id);
      setShown(roll.t);
      setSpinning(false);
    }, 1600); // about when the roller's dice have settled into rows
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [fresh, roll]);
  const tone = !spinning && roll.nat === 20 ? 'text-emerald-300' : !spinning && roll.nat === 1 ? 'text-rose-400' : 'text-amber-300';
  return (
    <div
      className={clsx('rounded-lg border border-l-[3px] px-2.5 py-1.5', m.secret ? 'border-dashed border-stone-700 bg-stone-900/60' : 'border-stone-700/70 bg-stone-900/80', mine && 'ml-6')}
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-stone-400">
          <span className="font-semibold" style={{ color }}>
            {mine ? 'You' : m.name}
          </span>
          {roll.l ? ` · ${roll.l}` : ''}
          {m.secret && ' · only DMs see this'}
        </span>
        <span className="text-[10px] text-stone-500">{time(m.at)}</span>
      </div>
      <div className="flex items-center gap-3">
        <Dices size={20} className={clsx('shrink-0', spinning && 'animate-spin')} style={{ color }} />
        <span className={clsx('font-display text-3xl font-bold tabular-nums', tone)}>{shown}</span>
        <span className="min-w-0 flex-1 text-xs break-words text-stone-500">
          {roll.f}
          {roll.adv ? ' · adv' : ''}
          {roll.dis ? ' · dis' : ''}
          {roll.crit ? ' · crit' : ''}
          <br />
          {roll.d.map((g, i) => (
            <span key={i}>
              {i > 0 && (g.n ? ' − ' : ' + ')}[
              {/* Lowest to highest (an advantage pair stays together). */}
              {g.v
                .map((v, j) => ({ v, x: g.x?.[j] }))
                .sort((p, q) => p.v - q.v)
                .map(({ v, x }, j) => (
                  <span key={j}>
                    {j > 0 && ', '}
                    <span className={clsx(g.s === 20 && v === 20 && 'text-emerald-300', g.s === 20 && v === 1 && 'text-rose-400')}>{v}</span>
                    {x !== undefined && (
                      <>
                        {' '}
                        <span className="text-stone-600 line-through">{x}</span>
                      </>
                    )}
                  </span>
                ))}
              ]
            </span>
          ))}
          {roll.m ? ` ${roll.m < 0 ? '−' : '+'} ${Math.abs(roll.m)}` : ''}
        </span>
      </div>
      {!spinning && roll.nat === 20 && <div className="text-xs font-semibold text-emerald-300">Natural 20!</div>}
      {!spinning && roll.nat === 1 && <div className="text-xs font-semibold text-rose-400">Natural 1</div>}
    </div>
  );
}
