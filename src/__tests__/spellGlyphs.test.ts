import { describe, expect, it } from 'vitest';
import GLYPHS from '../data/spell-glyphs.json';
import S14 from '../data/spells-2014.json';
import S24 from '../data/spells-2024.json';
import SX from '../data/spells-extra.json';
import { ELEMENT_ACCENT, MOTIFS, PARCHMENT } from '../lib/play/glyphMotifs';

const table = GLYPHS as unknown as Record<string, [string, string, string?]>;

describe('spell glyphs', () => {
  it('has a picture for every spell, free rules and the other books', () => {
    const ids = [...S14, ...S24, ...SX].map((s) => (s as { i: string }).i.replace(/^xb-/, ''));
    expect(ids.filter((i) => !table[i])).toEqual([]);
  });
  it('only uses pictures and elements that exist', () => {
    for (const [id, [motif, el, badge]] of Object.entries(table)) {
      expect(MOTIFS[motif], id).toBeTypeOf('function');
      if (badge) expect(MOTIFS[badge], id).toBeTypeOf('function');
      if (el) expect(ELEMENT_ACCENT[el], id).toBeTruthy();
    }
  });
  it('draws every picture as plain SVG', () => {
    for (const [name, draw] of Object.entries(MOTIFS)) {
      const svg = draw(PARCHMENT) + draw(ELEMENT_ACCENT.fire);
      expect(svg, name).toMatch(/^<(path|g|circle|ellipse|text|rect)\b/);
      expect(svg, name).not.toMatch(/undefined|NaN|<script/i);
    }
  });
});
