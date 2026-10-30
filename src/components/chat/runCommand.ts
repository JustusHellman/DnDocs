/**
 * Running the chat's slash commands. Everything that touches a character goes through the same
 * actions as the trackers (with a line in the chat that can be undone); nothing is ever rolled
 * for you: /cast opens the spell's card, /rest opens the rest dialog.
 */
import { COMMANDS, evalMath, findByName, matchWhisper, type Command } from '../../lib/chat/commands';
import { tableChat } from '../../lib/chat/bus';
import type { InitiativeContext } from '../../lib/battle/initiativeStore';
import { setInitiatives } from '../../lib/battle/sceneService';
import { hitDiceLeft, ordinal, pactLeft, resourceLeft, slotsLeft } from '../../lib/play/model';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { openPlay, readySpells } from '../../lib/play/ui';
import { loadSrdSpells } from '../../lib/play/spells';
import { tableLive } from '../../lib/play/live';

export interface CommandEnv {
  p: PlayerApi | null;
  isDM: boolean;
  initCtx: InitiativeContext | null;
  /** People you can whisper to: members, and characters (whispers go to their player). */
  people: { name: string; uid: string; label: string }[];
  whisper: (to: { uid: string; name: string }, text: string) => Promise<void>;
  note: (text: string) => void;
  /** Rest everyone in the party (DM). */
  partyRest: (kind: 'short' | 'long') => Promise<void>;
}

const needChar = (env: CommandEnv) => {
  if (env.p) return env.p;
  env.note(env.isDM ? 'Pick a character first (the character bar above the message box).' : 'You don’t have a character in this campaign yet.');
  return null;
};

export async function runCommand(cmd: Command, env: CommandEnv): Promise<void> {
  const { note } = env;
  switch (cmd.c) {
    case 'help':
      note(
        'Commands:\n' +
          COMMANDS.filter((c) => env.isDM || !c.dm)
            .map((c) => `${c.usage}  —  ${c.help}`)
            .join('\n'),
      );
      return;
    case 'unknown':
      note(`There’s no /${cmd.name}. Type /help for the list.`);
      return;
    case 'bad':
      note(`Like this: ${cmd.usage}`);
      return;
    case 'math': {
      const total = evalMath(cmd.expr);
      if (total === null) return note(`Can’t work out “${cmd.expr}”. Numbers with + − × ÷ and brackets.`);
      await tableChat.event({ t: 'math', expr: cmd.expr.slice(0, 120), total, ...(Number.isInteger(total) && Math.abs(total) > 1 ? { half: Math.floor(total / 2) } : {}) });
      return;
    }
    case 'me':
      await tableChat.event({ t: 'me', text: cmd.text });
      return;
    case 'w': {
      const m = matchWhisper(cmd.rest, env.people);
      if (!m) return note(`Whisper to whom? ${env.people.map((p) => p.name).join(', ') || 'Nobody else is here yet.'}`);
      await env.whisper({ uid: m.to.uid, name: m.to.label }, m.text);
      return;
    }
    case 'init': {
      const ctx = env.initCtx;
      if (!ctx) return note('Initiative is entered on an open battle map.');
      const mine = ctx.unrolled.filter((t) => t.mine);
      const pick = (env.p && mine.find((t) => t.name === env.p!.entity.name)) ?? mine[0];
      if (!pick) return note(ctx.asDM ? 'Type creatures’ initiative in the initiative panel above.' : 'None of your tokens is waiting for initiative.');
      await setInitiatives(ctx.sceneId, { [pick.id]: cmd.total });
      await tableChat.event({ t: 'init', who: pick.name, total: cmd.total });
      return;
    }
    case 'rest': {
      if (cmd.party) {
        if (!env.isDM) return note('Only the DM can rest the whole party.');
        await env.partyRest(cmd.kind);
        return;
      }
      const p = needChar(env);
      if (p) openPlay({ kind: 'rest', entityId: p.entity.id, rest: cmd.kind });
      return;
    }
  }

  const p = needChar(env);
  if (!p) return;
  const { d, live } = p;
  switch (cmd.c) {
    case 'check': {
      const bits: string[] = [];
      const slots = d.slots.map((max, i) => (max ? `${ordinal(i + 1)} ${slotsLeft(d, live, i + 1)}/${max}` : '')).filter(Boolean);
      if (slots.length) bits.push(`Slots: ${slots.join(', ')}`);
      if (d.pact) bits.push(`Pact (${ordinal(d.pact.l)}): ${pactLeft(d, live)}/${d.pact.n}`);
      for (const r of d.resources) bits.push(`${r.name}: ${resourceLeft(r, live)}/${r.max}`);
      if (d.hitDiceMax) bits.push(`Hit dice: ${hitDiceLeft(d, live)}/${d.hitDiceMax}`);
      bits.push(live.conc ? `Concentrating${live.cs ? ` on ${live.cs}` : ''}` : 'Not concentrating');
      bits.push(live.re ? 'Reaction used' : 'Reaction ready');
      note(`${p.entity.name}\n${bits.join('\n')}`);
      return;
    }
    case 'conc':
      await p.setConc(cmd.on, cmd.spell);
      return;
    case 'react':
      await p.setReact(!live.re);
      return;
    case 'cast': {
      if (!cmd.spell) {
        const lv = cmd.level ?? 1;
        if (d.pact && d.pact.l === lv && !d.slots[lv - 1]) {
          if (!(await p.spendPact())) note('No pact slots left.');
          return;
        }
        if (!d.slots[lv - 1]) return note(`${p.entity.name} has no ${ordinal(lv)}-level slots.`);
        if (!(await p.spendSlot(lv))) note(`No ${ordinal(lv)}-level slots left.`);
        return;
      }
      const srd = await loadSrdSpells(p.edition);
      const all = [...srd, ...tableLive().custom];
      const byId = new Map(all.map((s) => [s.i, s]));
      const sp = findByName(cmd.spell, readySpells(p.def, d, byId), (s) => s.n) ?? findByName(cmd.spell, all, (s) => s.n);
      if (!sp) return note(`No spell called “${cmd.spell}”. Your spells are under Spells on the character bar.`);
      if (cmd.level !== undefined && cmd.level < sp.l) return note(`${sp.n} is ${ordinal(sp.l)} level: it can’t be cast with a ${ordinal(cmd.level)}-level slot.`);
      openPlay({ kind: 'cast', entityId: p.entity.id, spellId: sp.i, level: cmd.level });
      return;
    }
    case 'use':
    case 'regain': {
      const slot = cmd.what.match(/^(?:slot\s*(\d)|(\d)(?:st|nd|rd|th)?(?:[-\s]*level)?\s*slot)$/i);
      if (slot) {
        const lv = Number(slot[1] ?? slot[2]);
        if (cmd.c === 'use') {
          if (!(await p.spendSlot(lv))) note(`No ${ordinal(lv)}-level slots left.`);
        } else await p.regainSlot(lv);
        return;
      }
      const r = findByName(cmd.what, d.resources, (x) => x.name);
      if (!r) return note(`${p.entity.name} has no “${cmd.what}”. ${d.resources.length ? `There’s: ${d.resources.map((x) => x.name).join(', ')}.` : 'Add your own counters with the gear on the tracker.'}`);
      if (cmd.c === 'use') {
        if (!(await p.spendRes(r, cmd.n))) note(`Not enough ${r.name} left (${resourceLeft(r, live)}).`);
      } else await p.regainRes(r, cmd.n);
      return;
    }
  }
}
