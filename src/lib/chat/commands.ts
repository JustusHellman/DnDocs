/**
 * The table chat's slash commands (pure: reading them, and the list the autocomplete and /help
 * show). Running them is the chat's job.
 */

export interface CommandSpec {
  name: string;
  aliases?: string[];
  usage: string;
  help: string;
  /** Only the DM sees it in the list. */
  dm?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  { name: 'r', aliases: ['roll'], usage: '/r 1d20+5 [adv|dis] [label]', help: 'Roll dice (a bare 2d6+3 works too).' },
  { name: 'math', aliases: ['='], usage: '/math 12+7+3  or  = 12+7+3', help: 'Add things up (+ − × ÷ and brackets); shows half too.' },
  { name: 'cast', usage: '/cast fireball [level]  or  /cast 2', help: 'Cast one of your spells (opens its card), or just use a slot of that level.' },
  { name: 'use', usage: '/use rage [n]', help: 'Use a class resource or counter (Rage, Ki, Star Map…).' },
  { name: 'regain', usage: '/regain ki [n]', help: 'Get uses back (slot: /regain slot 2).' },
  { name: 'conc', usage: '/conc [spell] | /conc off', help: 'Start or stop concentrating.' },
  { name: 'react', usage: '/react', help: 'Mark your reaction used (again to clear it).' },
  { name: 'check', aliases: ['status'], usage: '/check', help: 'What you have left (only you see it).' },
  { name: 'init', usage: '/init 17', help: 'Enter the initiative you rolled.' },
  { name: 'w', aliases: ['whisper'], usage: '/w Name message', help: 'Whisper: only that person and the DM see it.' },
  { name: 'me', usage: '/me ducks behind the cart', help: 'An action line.' },
  { name: 'rest', usage: '/rest short | long', help: 'Take a rest (opens the rest dialog).' },
  { name: 'rest party', usage: '/rest party short | long', help: 'Rest the whole party at once.', dm: true },
  { name: 'help', aliases: ['?'], usage: '/help', help: 'This list.' },
];

export type Command =
  | { c: 'math'; expr: string }
  | { c: 'cast'; spell?: string; level?: number }
  | { c: 'use'; what: string; n: number }
  | { c: 'regain'; what: string; n: number }
  | { c: 'conc'; on: boolean; spell?: string }
  | { c: 'react' }
  | { c: 'check' }
  | { c: 'init'; total: number }
  | { c: 'w'; rest: string }
  | { c: 'me'; text: string }
  | { c: 'rest'; kind: 'short' | 'long'; party: boolean }
  | { c: 'help' }
  | { c: 'unknown'; name: string }
  | { c: 'bad'; usage: string };

const spec = (name: string) => COMMANDS.find((c) => c.name === name)!;
const bad = (name: string): Command => ({ c: 'bad', usage: spec(name).usage });

/** Reads a slash command (or "= 3+4"). null: not a command (an ordinary message or a /r roll). */
export function parseCommand(text: string): Command | null {
  const s = text.trim();
  if (s.startsWith('=')) return s.length > 1 ? { c: 'math', expr: s.slice(1).trim() } : bad('math');
  const m = s.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const rest = m[2].trim();
  switch (name) {
    case 'r':
    case 'roll':
      return null; // the dice have their own reader
    case 'math':
    case 'calc':
      return rest ? { c: 'math', expr: rest } : bad('math');
    case 'cast': {
      if (!rest) return bad('cast');
      const lv = rest.match(/^(?:level\s*|lvl\s*|l)?(\d)(?:st|nd|rd|th)?(?:\s*level)?$/i);
      if (lv) return { c: 'cast', level: Number(lv[1]) };
      const at = rest.match(/^(.+?)\s+(?:at\s+)?(?:level\s*|lvl\s*)?(\d)(?:st|nd|rd|th)?(?:\s*level)?$/i);
      return at ? { c: 'cast', spell: at[1].trim(), level: Number(at[2]) } : { c: 'cast', spell: rest };
    }
    case 'use':
    case 'regain': {
      if (!rest) return bad(name);
      const n = rest.match(/^(.+?)\s+(\d{1,3})$/);
      return { c: name, what: (n ? n[1] : rest).trim(), n: n ? Math.max(1, Number(n[2])) : 1 };
    }
    case 'conc':
    case 'concentrate':
    case 'concentration': {
      if (/^(off|end|stop|drop|no)$/i.test(rest)) return { c: 'conc', on: false };
      if (!rest || /^(on|yes)$/i.test(rest)) return { c: 'conc', on: true };
      return { c: 'conc', on: true, spell: rest };
    }
    case 'react':
    case 'reaction':
      return { c: 'react' };
    case 'check':
    case 'status':
      return { c: 'check' };
    case 'init':
    case 'initiative': {
      const n = rest.match(/^-?\d{1,3}$/);
      return n ? { c: 'init', total: Number(rest) } : bad('init');
    }
    case 'w':
    case 'whisper':
    case 'msg': {
      // The name can have spaces: "/w Old Tom hello" is matched against the people at the table later.
      const sp = rest.indexOf(' ');
      if (sp < 1) return bad('w');
      return { c: 'w', rest };
    }
    case 'me':
      return rest ? { c: 'me', text: rest.slice(0, 300) } : bad('me');
    case 'rest': {
      const party = /\bparty\b/i.test(rest);
      const kind = /\blong\b/i.test(rest) ? 'long' : /\bshort\b/i.test(rest) ? 'short' : null;
      return kind ? { c: 'rest', kind, party } : bad(party ? 'rest party' : 'rest');
    }
    case 'help':
    case '?':
    case 'commands':
      return { c: 'help' };
    default:
      return { c: 'unknown', name };
  }
}

/**
 * "/w Old Tom hello there" with the people at the table: the longest name the text starts with
 * (first names work too). Returns who and the message, or null.
 */
export function matchWhisper<T extends { name: string }>(rest: string, people: T[]): { to: T; text: string } | null {
  const lower = rest.toLowerCase();
  let best: { to: T; len: number } | null = null;
  for (const p of people) {
    for (const cand of [p.name, p.name.split(' ')[0]]) {
      const c = cand.toLowerCase();
      if (c && lower.startsWith(c) && (lower.length === c.length || lower[c.length] === ' ') && (!best || c.length > best.len)) best = { to: p, len: c.length };
    }
  }
  if (!best) return null;
  const text = rest.slice(best.len).trim();
  return text ? { to: best.to, text } : null;
}

/** The best match for a typed name among options ("guid bolt" → "Guiding Bolt"). */
export function findByName<T>(query: string, items: T[], name: (t: T) => string): T | null {
  const q = norm(query);
  if (!q) return null;
  const exact = items.find((t) => norm(name(t)) === q);
  if (exact) return exact;
  const starts = items.filter((t) => norm(name(t)).startsWith(q));
  if (starts.length) return starts.sort((a, b) => name(a).length - name(b).length)[0];
  const words = q.split(' ');
  const all = items.filter((t) => {
    const n = norm(name(t));
    return words.every((w) => n.split(' ').some((nw) => nw.startsWith(w)));
  });
  if (all.length) return all.sort((a, b) => name(a).length - name(b).length)[0];
  const inside = items.filter((t) => norm(name(t)).includes(q));
  return inside.length ? inside[0] : null;
}
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Safe arithmetic for /math: numbers, + − × ÷ (also x and *), brackets. Division keeps decimals
 * (rounded to 2). null when it isn't a sum.
 */
export function evalMath(expr: string): number | null {
  const s = expr.replace(/[×x]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  if (!s || /[^0-9+\-*/().]/.test(s) || s.length > 200) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number | null => {
    if (peek() === '(') {
      i++;
      const v = sum();
      if (v === null || peek() !== ')') return null;
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      const v = num();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      i++;
      return num();
    }
    const m = s.slice(i).match(/^\d+(?:\.\d+)?/);
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number | null => {
    let v = num();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = s[i++];
      const r = num();
      if (r === null) return null;
      if (op === '/' && r === 0) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = s[i++];
      const r = product();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  if (v === null || i !== s.length || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

/** What the autocomplete offers for the text typed so far (command names only, before a space). */
export function commandHints(text: string, isDM: boolean): CommandSpec[] {
  const m = text.match(/^\/(\S*)$/);
  if (!m) return [];
  const q = m[1].toLowerCase();
  return COMMANDS.filter((c) => (isDM || !c.dm) && (c.name.startsWith(q) || c.aliases?.some((a) => a.startsWith(q))));
}
