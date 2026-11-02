import { memo, useEffect, useState } from 'react';
import clsx from 'clsx';
import GLYPHS from '../../data/spell-glyphs.json';
import { ELEMENT_ACCENT, MOTIFS, PARCHMENT } from '../../lib/play/glyphMotifs';
import type { Spell } from '../../lib/play/spells';

type Glyph = [motif: string, element: string, badge?: string];
const TABLE = GLYPHS as unknown as Record<string, Glyph>;

const BY_SCHOOL: Record<string, string> = {
  Abjuration: 'shield',
  Conjuration: 'portal',
  Divination: 'eye',
  Enchantment: 'spiral',
  Evocation: 'burst',
  Illusion: 'mask',
  Necromancy: 'skull',
  Transmutation: 'sparkle',
};
const BY_DAMAGE: Record<string, string> = { fire: 'flame', cold: 'snow', lightning: 'bolt', thunder: 'thunder', radiant: 'sun', necrotic: 'skull', acid: 'drip', poison: 'bubbles', psychic: 'mind', force: 'missiles' };

/** A spell's picture: from the table, or (the campaign's own cards) from its damage, healing or school. */
export function glyphOf(sp: Pick<Spell, 'i'> & Partial<Pick<Spell, 's' | 'dm' | 'he'>>): Glyph {
  const known = TABLE[sp.i.replace(/^xb-/, '')];
  if (known) return known;
  const ty = sp.dm?.ty?.toLowerCase() ?? '';
  const el = ELEMENT_ACCENT[ty] ? ty : sp.he ? 'heal' : '';
  return [BY_DAMAGE[ty] ?? (sp.he ? 'heart' : BY_SCHOOL[sp.s ?? ''] ?? 'sparkle'), el];
}

// Families whose big picture is shared (a summoning circle, a compass…): in a list, where the
// corner badge is too small to see, the badge's picture says more.
const BADGE_IN_LISTS = new Set(['summon', 'compass', 'aura', 'person', 'speech', 'rune']);

/** The same drawing in one dark colour (moving with it), just under it: keeps it readable on any disc. */
const shadowOf = (svg: string) =>
  `<g transform="translate(0 1.6)" opacity=".38" aria-hidden="true">${svg
    .replace(/fill="(?!none)[^"]*"/g, 'fill="#120c08"')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="#120c08"')}</g>`;

const cache = new Map<string, string>();
export function svgBody([motif, el, badge]: Glyph, tone: string, small: boolean) {
  if (small && badge) {
    if (BADGE_IN_LISTS.has(motif)) motif = badge;
    badge = undefined;
  }
  const key = `${motif}|${el}|${badge ?? ''}|${tone}`;
  let s = cache.get(key);
  if (!s) {
    const draw = MOTIFS[motif] ?? MOTIFS.sparkle;
    const a = ELEMENT_ACCENT[el] ?? PARCHMENT;
    const pic = draw(a);
    s = `<circle cx="32" cy="32" r="30.5" fill="${tone}" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/>${shadowOf(pic)}${pic}`;
    if (badge && MOTIFS[badge]) s += `<g transform="translate(41 41) scale(.36)"><circle cx="32" cy="32" r="31" fill="#1b1222" stroke="${tone}" stroke-width="5"/>${MOTIFS[badge](a)}</g>`;
    cache.set(key, s);
  }
  return s;
}

/**
 * A spell's little picture on its coloured disc (the colour follows the person's colouring choice).
 * Still by default; `live` makes it move for a few seconds after it appears (a card opening), and a
 * new `cast` number makes it pop and move again (the spell was just cast).
 */
function SpellGlyph({ sp, tone, size = 24, live, cast, className, title }: { sp: Pick<Spell, 'i'> & Partial<Pick<Spell, 's' | 'dm' | 'he'>>; tone: string; size?: number; live?: boolean; cast?: number; className?: string; title?: string }) {
  const [moving, setMoving] = useState(!!live);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (!live) return;
    setMoving(true);
    const t = setTimeout(() => setMoving(false), 3200);
    return () => clearTimeout(t);
  }, [live, sp.i]);
  useEffect(() => {
    if (!cast) return;
    setMoving(true);
    setPopping(true);
    const a = setTimeout(() => setPopping(false), 750);
    const b = setTimeout(() => setMoving(false), 3500);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [cast]);
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={clsx('glyph shrink-0', moving && 'glyph-live', popping && 'glyph-cast', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svgBody(glyphOf(sp), tone, size < 30) }}
    />
  );
}

export default memo(SpellGlyph);
