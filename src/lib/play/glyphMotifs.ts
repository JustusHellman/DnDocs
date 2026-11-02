/**
 * The pictures for spell glyphs: small SVG drawings (64 × 64, on a coloured disc drawn by
 * SpellGlyph) in one shared style. `a` is the accent colour of the spell's element (fire, cold…),
 * parchment when it has none. Parts with a `g-…` class move when the glyph is "live" (see
 * index.css): flames flicker, mist drifts, eyes blink — only when a card opens or a spell is cast.
 */
const P = '#f6eedb';
const K = 'rgba(0,0,0,.28)';
const L = 'stroke-linecap="round" stroke-linejoin="round"';
const line = (d: string, c = P, w = 2.6, cls = '') => `<path ${cls ? `class="${cls}" ` : ''}d="${d}" fill="none" stroke="${c}" stroke-width="${w}" ${L}/>`;
const fill = (d: string, c = P, cls = '', extra = '') => `<path ${cls ? `class="${cls}" ` : ''}d="${d}" fill="${c}"${extra ? ` ${extra}` : ''}/>`;
const dot = (x: number, y: number, r: number, c = P, cls = '') => `<circle ${cls ? `class="${cls}" ` : ''}cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const g = (cls: string, body: string, extra = '') => `<g class="${cls}"${extra ? ` ${extra}` : ''}>${body}</g>`;

const FLAME_OUT = 'M32,54 C19,54 16,41 23,33 C23,38 27,40 27,40 C25,30 31,19 38,14 C36,23 46,27 46,40 C46,48 40,54 32,54Z';
const FLAME_IN = 'M32,52 C25,52 24,44 28,40 C29,44 31,44 31,44 C31,38 34,34 37,32 C37,38 41,40 41,45 C41,49 37,52 32,52Z';
const flame = (a: string) => g('g-flick', fill(FLAME_OUT, a === P ? '#ffb23e' : a) + fill(FLAME_IN, '#fff0a8'));
const person = (c = P) => dot(32, 19, 6, c) + fill('M21,52 L23,32 Q32,26 41,32 L43,52Z', c);
const shieldPath = 'M32,11 L49,17 L49,31 C49,42 41,50 32,54 C23,50 15,42 15,31 L15,17 Z';

export const MOTIFS: Record<string, (a: string) => string> = {
  // Elements and energy
  flame,
  burst: (a) =>
    g('g-pulse', fill('M32,8 L37,22 L52,16 L44,29 L57,35 L42,38 L46,53 L33,43 L22,55 L23,40 L8,38 L20,29 L12,16 L27,22Z', a === P ? '#ffb23e' : a)) +
    dot(32, 33, 8, '#fff0a8') + dot(18, 18, 1.6, '#fff0a8', 'g-rise') + dot(47, 47, 1.4, '#fff0a8', 'g-rise'),
  bolt: (a) => fill('M36,7 L20,35 L31,35 L24,58 L46,27 L34,27 L42,7 Z', a, 'g-flash', 'stroke="#fff" stroke-width="1.4"'),
  chain: (a) => g('g-flash', line('M10,22 L22,30 L18,36 L32,40 L28,46 L52,52', a, 3.4) + dot(10, 22, 3, a) + dot(32, 40, 3, a) + dot(52, 52, 3, a)) + dot(46, 18, 4, P) + dot(46, 18, 1.6, a),
  snow: (a) =>
    g(
      'g-spin',
      [0, 60, 120].map((r) => `<g transform="rotate(${r} 32 32)">${line('M32,12 L32,52 M32,18 L27,13 M32,18 L37,13 M32,46 L27,51 M32,46 L37,51', a, 2.6)}</g>`).join(''),
    ) + dot(32, 32, 3.5, a),
  shard: (a) => g('g-pulse', fill('M32,8 L40,30 L32,56 L24,30Z', a) + fill('M16,22 L24,36 L18,50 L12,34Z', a, '', 'opacity=".75"') + fill('M48,22 L52,34 L46,50 L40,36Z', a, '', 'opacity=".75"')) + line('M32,12 L35,30', '#fff', 1.4),
  drop: (a) => g('g-float', fill('M32,10 C24,24 18,32 18,40 A14,14 0 0 0 46,40 C46,32 40,24 32,10Z', a === P ? '#bfe6ff' : a) + line('M25,40 A7,7 0 0 0 31,47', '#fff', 2)),
  wave: (a) => {
    const c = a === P ? '#bfe6ff' : a;
    return g('g-drift', line('M10,26 Q16,18 22,26 T34,26 T46,26 T56,24', c, 3)) + g('g-drift2', line('M8,36 Q14,28 20,36 T32,36 T44,36 T56,34', P, 3)) + g('g-drift', line('M10,46 Q16,38 22,46 T34,46 T46,46 T56,44', c, 3));
  },
  wind: (a) =>
    g('g-drift', line('M10,24 L38,24 A6,6 0 1 0 32,18', a, 3)) + g('g-drift2', line('M10,34 L46,34 A6,6 0 1 1 40,40', P, 3)) + g('g-drift', line('M14,44 L30,44 A5,5 0 1 0 25,39', a, 3)),
  tornado: (a) => g('g-sway', line('M14,14 L50,14 M18,22 L46,22 M22,30 L42,30 M25,38 L38,38 M28,46 L35,46 M31,53 L33,53', a, 3.4)),
  thunder: (a) => dot(32, 32, 5, a) + g('g-ring', line('M20,20 A17,17 0 0 0 20,44 M44,20 A17,17 0 0 1 44,44', a, 2.8)) + g('g-ring2', line('M13,13 A27,27 0 0 0 13,51 M51,13 A27,27 0 0 1 51,51', P, 2.4)),
  drip: (a) => fill('M14,20 Q32,8 50,20 Q50,28 44,28 Q40,28 40,34 Q36,28 32,30 Q28,28 24,34 Q24,26 14,26Z', a) + dot(24, 42, 3, a, 'g-fall') + dot(40, 44, 3.4, a, 'g-fall2') + dot(32, 50, 2.6, a, 'g-fall'),
  bubbles: (a) => fill('M22,24 L42,24 L42,30 L50,48 Q51,54 45,54 L19,54 Q13,54 14,48 L22,30Z', K) + line('M22,24 L42,24 M22,24 L22,30 L14,48 Q13,54 19,54 L45,54 Q51,54 50,48 L42,30 L42,24', P, 2.4) + fill('M17,44 L47,44 L50,49 Q50,52 46,52 L18,52 Q14,52 14,49Z', a) + dot(28, 36, 2.4, a, 'g-rise') + dot(36, 30, 1.8, a, 'g-rise2') + dot(32, 16, 2.2, a, 'g-rise'),
  cloud: (a) => g('g-drift', fill('M16,40 A8,8 0 0 1 18,25 A11,11 0 0 1 39,21 A9,9 0 0 1 50,32 A7,7 0 0 1 48,44 L19,44 A6,6 0 0 1 16,40Z', a)) + g('g-drift2', dot(18, 50, 2, a) + dot(30, 52, 2, a) + dot(42, 50, 2, a)),
  storm: (a) => fill('M14,34 A8,8 0 0 1 16,20 A11,11 0 0 1 37,16 A9,9 0 0 1 48,27 A7,7 0 0 1 46,38 L17,38 A6,6 0 0 1 14,34Z', K) + line('M14,34 A8,8 0 0 1 16,20 A11,11 0 0 1 37,16 A9,9 0 0 1 48,27 A7,7 0 0 1 46,38 L17,38 A6,6 0 0 1 14,34Z', P, 2.4) + fill('M33,38 L26,48 L32,48 L28,58 L40,44 L34,44 L38,38Z', a === P ? '#fff6a8' : a, 'g-flash'),
  sun: (a) => {
    const c = a === P ? '#ffe69a' : a;
    return g('g-spin', Array.from({ length: 8 }, (_, i) => `<g transform="rotate(${i * 45} 32 32)">${fill('M30,6 L34,6 L32,15Z', c)}</g>`).join('')) + dot(32, 32, 13, c) + dot(32, 32, 8, '#fff7cf');
  },
  moon: (a) => fill('M38,8 A10,10 0 1 0 38,26 A8,8 0 1 1 38,8Z', a === P ? '#fff7cf' : a) + g('g-beam', fill('M26,24 L38,24 L45,54 L19,54Z', a === P ? '#fff7cf' : a, '', 'opacity=".7"')) + `<ellipse cx="32" cy="54" rx="13" ry="3" fill="${a === P ? '#fff7cf' : a}"/>`,
  star: (a) => {
    const s = (x: number, y: number, r: number, cls: string) => fill(`M${x},${y - r} L${x + r * 0.3},${y - r * 0.3} L${x + r},${y} L${x + r * 0.3},${y + r * 0.3} L${x},${y + r} L${x - r * 0.3},${y + r * 0.3} L${x - r},${y} L${x - r * 0.3},${y - r * 0.3}Z`, a === P ? '#fff7cf' : a, cls);
    return s(30, 34, 16, 'g-pulse') + s(48, 16, 6, 'g-blink') + s(16, 16, 4, 'g-blink2') + s(50, 48, 4, 'g-blink');
  },
  orb: (a) => g('g-pulse', dot(32, 32, 17, a === P ? '#d6c2ff' : a) + dot(32, 32, 11, '#fff').replace('/>', ' opacity=".25"/>')) + `<ellipse cx="26" cy="25" rx="5" ry="3.5" fill="#fff" opacity=".75" transform="rotate(-35 26 25)"/>`,
  dark: (a) => g('g-pulse', dot(32, 32, 16, '#1b1222') + line('M32,32 m-16,0 a16,16 0 1 0 32,0 a16,16 0 1 0 -32,0', a === P ? '#a98bd6' : a, 2)) + g('g-spin', line('M14,22 Q20,14 28,15 M50,42 Q44,50 36,49 M45,15 Q51,20 51,27', a === P ? '#a98bd6' : a, 2)),
  skull: (a) => fill('M32,10 C20,10 15,19 15,28 C15,35 19,38 21,40 L21,48 L43,48 L43,40 C45,38 49,35 49,28 C49,19 44,10 32,10Z', P) + g('g-blink', dot(25, 29, 5, a === P ? '#2a1838' : a) + dot(39, 29, 5, a === P ? '#2a1838' : a)) + fill('M32,34 L29,40 L35,40Z', '#2a1838') + line('M27,48 L27,53 M32,48 L32,54 M37,48 L37,53', P, 2.4),
  ghost: (a) => g('g-float', fill('M18,54 L18,28 A14,14 0 0 1 46,28 L46,54 L41,49 L36,54 L32,49 L28,54 L23,49Z', a === P ? '#e4eef5' : a, '', 'opacity=".92"') + dot(26, 29, 3, '#2a1838') + dot(38, 29, 3, '#2a1838') + `<ellipse cx="32" cy="38" rx="3" ry="4" fill="#2a1838"/>`),
  // Mind and body
  eye: (a) => g('g-eye', fill('M10,32 Q32,12 54,32 Q32,52 10,32Z', P) + dot(32, 32, 8, a === P ? '#2f6e8e' : a) + dot(32, 32, 3.6, '#1b1222') + dot(35, 29, 1.6, '#fff')),
  sleep: (a) => line('M12,34 Q32,46 52,34', P, 3) + line('M18,39 L15,44 M26,42 L25,47 M38,42 L39,47 M46,39 L49,44', P, 2.2) + g('g-rise', `<text x="40" y="24" font-size="14" font-weight="bold" font-family="Georgia" fill="${a === P ? P : a}">z</text>`) + g('g-rise2', `<text x="48" y="15" font-size="10" font-weight="bold" font-family="Georgia" fill="${a === P ? P : a}">z</text>`),
  spiral: (a) => g('g-spin', line('M32,32 m0,-2 a2,2 0 1 1 -2,2 a5,5 0 0 1 5,-5 a8,8 0 0 1 8,8 a11,11 0 0 1 -11,11 a14,14 0 0 1 -14,-14 a17,17 0 0 1 17,-17 a20,20 0 0 1 20,20', a === P ? '#ffa8d8' : a, 3)),
  mask: (a) => g('g-sway', fill('M14,16 Q32,10 50,16 Q52,38 32,52 Q12,38 14,16Z', P) + fill('M20,25 Q24,21 28,25 Q24,28 20,25Z', '#1b1222') + fill('M36,25 Q40,21 44,25 Q40,28 36,25Z', '#1b1222') + line('M24,38 Q32,44 40,38', a === P ? '#9a3b6b' : a, 2.6) + line('M17,18 Q12,26 8,24', a === P ? '#d8a8ff' : a, 2)),
  speech: (a) => fill('M12,16 L52,16 Q55,16 55,19 L55,38 Q55,41 52,41 L28,41 L18,51 L20,41 L12,41 Q9,41 9,38 L9,19 Q9,16 12,16Z', P) + g('g-blink', dot(22, 29, 3, a === P ? '#6d3fa0' : a)) + g('g-blink2', dot(32, 29, 3, a === P ? '#6d3fa0' : a)) + g('g-blink', dot(42, 29, 3, a === P ? '#6d3fa0' : a)),
  note: (a) => g('g-float', fill('M22,46 A6,5 0 1 1 22,45.9Z', P) + line('M27,46 L27,16 L48,11 L48,40', P, 3) + fill('M43,40 A6,5 0 1 1 43,39.9Z', P)) + dot(14, 22, 2, a === P ? '#ffd36b' : a, 'g-blink') + dot(54, 24, 1.6, a === P ? '#ffd36b' : a, 'g-blink2'),
  heart: (a) => g('g-pulse', fill('M32,52 C14,40 10,30 14,22 C18,14 28,14 32,22 C36,14 46,14 50,22 C54,30 50,40 32,52Z', a === P ? '#ff8fa8' : a) + line('M20,24 Q22,20 26,20', '#fff', 2)),
  hand: (a) => g('g-float', fill('M22,54 L20,36 L14,28 Q12,24 16,24 L22,30 L22,14 Q22,11 25,11 Q28,11 28,14 L28,28 L28,10 Q28,7 31,7 Q34,7 34,10 L34,28 L34,12 Q34,9 37,9 Q40,9 40,12 L40,30 L40,18 Q40,15 43,15 Q46,15 46,18 L46,38 Q46,48 40,54Z', P)) + dot(48, 12, 2.2, a, 'g-blink') + dot(14, 16, 1.8, a, 'g-blink2') + dot(52, 26, 1.4, a, 'g-blink'),
  grasp: (a) => fill('M10,54 Q14,40 20,36 L20,22 Q20,18 24,18 Q27,18 27,22 L27,32 L27,16 Q27,12 31,12 Q35,12 35,16 L35,32 L35,18 Q35,14 39,14 Q43,14 43,18 L43,34 Q48,30 52,32 Q54,36 48,42 Q44,48 42,54Z', a === P ? P : a) + g('g-shake', line('M8,24 L13,27 M6,34 L12,34 M54,16 L50,21', P, 2.2)),
  person: (a) => person(a === P ? P : a),
  chained: (a) => person() + g('g-tight', `<ellipse cx="32" cy="34" rx="15" ry="4" fill="none" stroke="${a === P ? '#ffd36b' : a}" stroke-width="2.4"/><ellipse cx="32" cy="43" rx="15" ry="4" fill="none" stroke="${a === P ? '#ffd36b' : a}" stroke-width="2.4"/>`),
  aura: (a) => g('g-pulse', dot(32, 32, 24, a === P ? '#ffe69a' : a, '', ) .replace('/>', ' opacity=".35"/>')) + person(),
  crown: (a) => fill('M12,44 L10,20 L22,30 L32,14 L42,30 L54,20 L52,44Z', a === P ? '#ffd36b' : a) + line('M12,50 L52,50', a === P ? '#ffd36b' : a, 4) + dot(32, 36, 3, '#fff', 'g-blink') + dot(20, 38, 2, '#fff') + dot(44, 38, 2, '#fff'),
  mind: (a) => fill('M22,54 L22,46 Q12,42 13,30 Q14,12 32,11 Q50,12 49,30 Q48,36 52,40 L48,42 L48,48 Q48,50 44,50 L38,50 L38,54Z', P) + g('g-spin', line('M31,30 m0,-2 a2,2 0 1 1 -2,2 a5,5 0 0 1 5,-5 a8,8 0 0 1 8,8', a === P ? '#9a3b6b' : a, 2.6)),
  laugh: (a) => dot(32, 32, 20, P) + line('M22,26 Q25,22 28,26 M36,26 Q39,22 42,26', '#1b1222', 2.4) + fill('M20,34 L44,34 Q42,46 32,46 Q22,46 20,34Z', '#1b1222') + fill('M25,41 Q32,44 39,41 Q36,46 32,46 Q28,46 25,41Z', a === P ? '#ff8fa8' : a) + g('g-sway', line('M50,14 L56,10 M52,22 L58,22 M10,14 L5,10', P, 2.2)),
  paralyzed: (a) => person() + g('g-shake', line('M12,20 L16,24 M52,20 L48,24 M10,36 L15,36 M54,36 L49,36', a === P ? '#ffd36b' : a, 2.4)),
  // Protection
  shield: (a) => fill(shieldPath, K) + line(shieldPath, P, 2.6) + `<path class="g-shim" d="${shieldPath}" fill="none" stroke="#fff" stroke-width="2.6" stroke-dasharray="14 110"/>` + (a === P ? '' : line('M32,20 L32,44 M20,30 L44,30', a, 3)),
  dome: (a) => g('g-pulse', fill('M10,46 A22,22 0 0 1 54,46Z', a === P ? '#cfe9f5' : a, '', 'opacity=".45"')) + line('M10,46 A22,22 0 0 1 54,46', P, 2.6) + line('M6,46 L58,46', P, 2.6) + line('M22,30 Q26,26 30,25', '#fff', 2),
  rune: (a) =>
    g('g-spin', line('M32,32 m-20,0 a20,20 0 1 0 40,0 a20,20 0 1 0 -40,0', P, 2.2) + [0, 72, 144, 216, 288].map((r) => `<g transform="rotate(${r} 32 32)">${line('M30,9 L34,15 M34,9 L30,15', P, 1.8)}</g>`).join('')) +
    fill('M32,20 L42,38 L22,38Z', 'none').replace('fill="none"', `fill="none" stroke="${a === P ? '#ffd36b' : a}" stroke-width="2.4"`),
  ward: (a) => fill('M32,10 L48,20 L48,40 L32,54 L16,40 L16,20Z', K) + line('M32,10 L48,20 L48,40 L32,54 L16,40 L16,20Z', P, 2.4) + g('g-blink', line('M32,20 L32,42 M24,28 L32,36 L40,28', a === P ? '#ffd36b' : a, 2.6)),
  // Movement and places
  steps: (a) => g('g-step1', `<ellipse cx="22" cy="44" rx="4.2" ry="6.8" fill="${P}"/>` + dot(22, 35, 2.3)) + g('g-step2', `<ellipse cx="42" cy="26" rx="4.2" ry="6.8" fill="${P}"/>` + dot(42, 17, 2.3)) + g('g-drift', line('M10,52 Q18,48 26,52 T42,52', a === P ? '#d8c8ff' : a, 2.2)),
  wings: (a) => g('g-flap', fill('M30,30 Q18,12 6,16 Q10,22 8,26 Q14,28 12,32 Q20,34 18,38 Q26,38 30,36Z', P) + fill('M34,30 Q46,12 58,16 Q54,22 56,26 Q50,28 52,32 Q44,34 46,38 Q38,38 34,36Z', P)) + `<ellipse cx="32" cy="36" rx="3.5" ry="9" fill="${a === P ? '#ffd36b' : a}"/>`,
  feather: (a) => g('g-fallsway', fill('M46,10 Q24,16 18,40 L22,40 Q30,26 46,10Z', P) + fill('M46,10 Q48,32 24,42 L22,40 Q40,30 46,10Z', P, '', 'opacity=".8"') + line('M44,13 L14,54', a === P ? '#7a6447' : a, 2)),
  portal: (a) => `<ellipse cx="32" cy="33" rx="15" ry="21" fill="#1b1222"/>` + g('g-spin', line('M32,33 m0,-3 a3,3 0 1 1 -3,3 a7,7 0 0 1 7,-7 a11,11 0 0 1 11,11', a === P ? '#d8a8ff' : a, 2.4)) + `<ellipse cx="32" cy="33" rx="15" ry="21" fill="none" stroke="${P}" stroke-width="3"/>`,
  door: (a) => fill('M18,54 L18,22 A14,14 0 0 1 46,22 L46,54Z', '#1b1222') + g('g-blink', fill('M22,54 L22,24 A10,10 0 0 1 42,24 L42,54Z', a === P ? '#ffe69a' : a, '', 'opacity=".85"')) + line('M18,54 L18,22 A14,14 0 0 1 46,22 L46,54 M12,54 L52,54', P, 2.6),
  boots: (a) => fill('M20,12 L34,12 L34,38 L50,44 Q54,46 52,52 L18,52Z', P) + g('g-drift', line('M8,24 L16,24 M6,32 L15,32 M9,40 L16,40', a === P ? '#ffd36b' : a, 2.4)),
  arrowup: (a) => g('g-float', line('M32,52 L32,14 M20,26 L32,14 L44,26', a === P ? P : a, 4)) + line('M16,54 L48,54', P, 2.4),
  // Nature
  leaf: (a) => g('g-sway', fill('M14,50 Q12,18 50,12 Q52,46 14,50Z', a === P ? '#8fd16a' : a) + line('M14,50 Q28,34 44,18 M26,38 L26,28 M34,30 L42,30', '#2f5e22', 2)),
  vine: (a) => g('g-sway', line('M12,54 Q14,36 28,36 Q42,36 40,24 Q38,14 28,16 Q22,18 26,24', a === P ? '#8fd16a' : a, 3.4) + fill('M40,42 Q50,38 52,46 Q44,50 40,42Z', '#8fd16a') + fill('M16,30 Q10,22 16,18 Q20,24 16,30Z', '#8fd16a')) + line('M18,44 L14,42 M33,36 L34,32 M41,30 L45,29', P, 2),
  thorns: (a) => g('g-sway', line('M10,46 Q22,26 32,36 T54,22', a === P ? '#8fd16a' : a, 3.6) + fill('M18,36 L14,30 L22,33Z M28,33 L26,26 L32,31Z M38,34 L42,40 L36,38Z M47,26 L50,20 L51,28Z', P)),
  tree: (a) => line('M32,54 L32,34 M32,42 L24,36 M32,38 L40,32', '#7a5a3a', 3.4) + g('g-sway', dot(32, 24, 13, a === P ? '#8fd16a' : a) + dot(22, 30, 8, a === P ? '#8fd16a' : a) + dot(42, 30, 8, a === P ? '#8fd16a' : a)),
  sprout: (a) => line('M12,52 L52,52', '#7a5a3a', 3) + g('g-grow', line('M32,52 L32,26', '#8fd16a', 3) + fill('M32,34 Q20,34 16,22 Q28,20 32,34Z', a === P ? '#8fd16a' : a) + fill('M32,28 Q42,26 48,14 Q34,12 32,28Z', a === P ? '#8fd16a' : a)),
  paw: (a) => g('g-pulse', fill('M32,52 Q20,52 20,42 Q20,32 32,32 Q44,32 44,42 Q44,52 32,52Z', P) + `<ellipse cx="18" cy="28" rx="4.5" ry="6" fill="${P}"/><ellipse cx="27" cy="19" rx="4.5" ry="6" fill="${P}"/><ellipse cx="37" cy="19" rx="4.5" ry="6" fill="${P}"/><ellipse cx="46" cy="28" rx="4.5" ry="6" fill="${P}"/>`) + (a === P ? '' : dot(32, 43, 4, a)),
  bird: (a) => g('g-flap', fill('M8,28 Q20,20 30,30 L34,30 Q44,20 56,28 Q46,30 40,38 L32,44 L24,38 Q18,30 8,28Z', P)) + dot(32, 33, 2.4, a === P ? '#ffd36b' : a),
  bugs: (a) => {
    const b = (x: number, y: number, cls: string) => g(cls, `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.2" fill="${a === P ? '#2a1f14' : a}"/>` + line(`M${x - 2},${y - 2} L${x - 4},${y - 5} M${x + 2},${y - 2} L${x + 4},${y - 5}`, P, 1.2));
    return b(20, 22, 'g-buzz') + b(38, 16, 'g-buzz2') + b(46, 34, 'g-buzz') + b(28, 38, 'g-buzz2') + b(16, 46, 'g-buzz') + b(40, 50, 'g-buzz2');
  },
  tentacles: (a) => g('g-sway', line('M14,56 Q10,40 20,34 Q28,30 24,22', a === P ? '#c9a8ff' : a, 4) + line('M32,56 Q34,40 28,30 Q24,22 32,14', a === P ? '#c9a8ff' : a, 4) + line('M50,56 Q56,42 46,34 Q38,28 44,20', a === P ? '#c9a8ff' : a, 4)) + `<ellipse cx="32" cy="56" rx="24" ry="4" fill="#1b1222"/>`,
  web: (a) =>
    [0, 45, 90, 135].map((r) => `<g transform="rotate(${r} 32 32)">${line('M32,8 L32,56', P, 1.6)}</g>`).join('') +
    [8, 15, 22].map((r) => line(`M32,32 m-${r},0 a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 -${2 * r},0`, P, 1.6)).join('') +
    g('g-float', dot(42, 22, 4, a === P ? '#1b1222' : a)),
  rock: (a) => fill('M10,48 L16,28 L28,18 L44,20 L54,34 L50,48Z', a === P ? '#a8987e' : a) + line('M16,28 L30,32 L44,20 M30,32 L32,48 M30,32 L50,40', '#5c4f3c', 2) + g('g-shake', line('M6,54 L58,54', P, 2.6)),
  quake: (a) => g('g-shake', fill('M8,40 L56,40 L56,54 L8,54Z', a === P ? '#a8987e' : a) + fill('M30,40 L36,46 L30,48 L36,54 L28,54 L26,48 L32,46 L26,40Z', '#1b1222')) + g('g-rise', fill('M18,34 L22,28 L26,34Z M40,32 L43,26 L46,32Z', a === P ? '#a8987e' : a)),
  meteor: (a) => g('g-fall', dot(40, 40, 10, a === P ? '#ffb23e' : a) + line('M33,33 L12,12 M38,30 L24,12 M30,38 L12,24', a === P ? '#ffd36b' : a, 3) + dot(40, 40, 5, '#fff0a8')) + g('g-fall2', dot(52, 16, 4, a === P ? '#ffb23e' : a) + line('M49,13 L42,6', a === P ? '#ffd36b' : a, 2)),
  wall: (a) =>
    fill('M8,22 L56,22 L56,50 L8,50Z', a === P ? '#a8987e' : a) + line('M8,31 L56,31 M8,40 L56,40 M20,22 L20,31 M36,22 L36,31 M50,22 L50,31 M14,31 L14,40 M28,31 L28,40 M44,31 L44,40 M22,40 L22,50 M38,40 L38,50', '#1b1222', 1.8) + line('M6,50 L58,50', P, 2.6),
  firewall: (a) => line('M6,52 L58,52', P, 2.6) + g('g-flick', [12, 24, 36, 48].map((x) => fill(`M${x},52 C${x - 8},52 ${x - 8},40 ${x - 4},34 C${x - 2},40 ${x},40 ${x},40 C${x - 2},30 ${x},22 ${x + 4},16 C${x + 4},26 ${x + 8},30 ${x + 8},40 C${x + 8},48 ${x + 4},52 ${x},52Z`, a === P ? '#ffb23e' : a)).join('')),
  // Objects
  book: (a) => fill('M8,18 Q20,14 31,20 L31,52 Q20,46 8,50Z', P) + fill('M56,18 Q44,14 33,20 L33,52 Q44,46 56,50Z', P) + line('M13,26 L26,28 M13,32 L26,34 M13,38 L26,40 M38,28 L51,26 M38,34 L51,32', '#7a6447', 1.6) + g('g-rise', dot(44, 40, 2.2, a === P ? '#ffd36b' : a) + dot(48, 12, 1.6, a === P ? '#ffd36b' : a)),
  scroll: (a) => fill('M16,14 L44,14 L44,48 Q44,54 38,54 L14,54 Q20,54 20,48 L20,18 Q20,14 16,14Z', P) + fill('M12,14 A4,4 0 0 1 20,14 L20,18 L12,18Z', '#d8c8a8') + line('M25,24 L39,24 M25,30 L39,30 M25,36 L35,36', '#7a6447', 1.8) + g('g-blink', fill('M33,40 L36,46 L42,47 L37,51 L39,56 L33,53 L27,56 L29,51 L24,47 L30,46Z', a === P ? '#ffd36b' : a)),
  key: (a) => g('g-sway', dot(22, 22, 11, 'none').replace('fill="none"', `fill="none" stroke="${a === P ? '#ffd36b' : a}" stroke-width="4"`) + line('M30,30 L52,52 M44,44 L50,38 M48,48 L54,42', a === P ? '#ffd36b' : a, 4)),
  lock: (a) => line('M22,30 L22,22 A10,10 0 0 1 42,22 L42,30', P, 4) + fill('M16,30 L48,30 L48,54 L16,54Z', a === P ? '#ffd36b' : a) + dot(32, 40, 3.5, '#1b1222') + fill('M30,40 L34,40 L35,48 L29,48Z', '#1b1222') + `<path class="g-shim" d="M16,30 L48,30 L48,54 L16,54Z" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="10 102"/>`,
  hourglass: (a) => g('g-flip', line('M16,10 L48,10 M16,54 L48,54', P, 3.4) + line('M20,10 Q20,26 32,32 Q20,38 20,54 M44,10 Q44,26 32,32 Q44,38 44,54', P, 2.4) + fill('M24,18 L40,18 Q38,26 32,30 Q26,26 24,18Z', a === P ? '#ffd36b' : a) + fill('M32,40 L40,52 L24,52Z', a === P ? '#ffd36b' : a)),
  sword: (a) => g('g-shim2', fill('M32,6 L37,14 L37,40 L27,40 L27,14Z', a === P ? '#dfe7ef' : a) + line('M32,12 L32,38', '#fff', 1.4)) + line('M20,42 L44,42', '#c9a050', 4) + line('M32,44 L32,54', '#7a5a3a', 4) + dot(32, 56, 3, '#c9a050'),
  daggers: (a) => g('g-spin', [0, 90, 180, 270].map((r) => `<g transform="rotate(${r} 32 32)">${fill('M32,6 L35,12 L35,22 L29,22 L29,12Z', a === P ? '#dfe7ef' : a)}${line('M26,23 L38,23', '#c9a050', 2.4)}</g>`).join('')) + dot(32, 32, 4, P),
  arrows: (a) => g('g-fly', [14, 32, 50].map((y, i) => line(`M${8 + i * 2},${y + 6} L${46 + i * 2},${y - 6}`, P, 2.6) + fill(`M${50 + i * 2},${y - 7} L${41 + i * 2},${y - 9} L${45 + i * 2},${y - 1}Z`, a === P ? '#dfe7ef' : a)).join('')),
  missiles: (a) => g('g-fly', [18, 32, 46].map((y) => fill(`M12,${y} L40,${y - 3} L52,${y} L40,${y + 3}Z`, a === P ? '#d6c2ff' : a) + dot(12, y, 2, '#fff')).join('')),
  beam: (a) => dot(14, 32, 7, P) + g('g-beam', fill('M16,28 L56,22 L56,42 L16,36Z', a === P ? '#ffe69a' : a, '', 'opacity=".9"')) + `<path class="g-shim" d="M18,32 L56,32" stroke="#fff" stroke-width="2.4" stroke-dasharray="8 30"/>`,
  flask: (a) => fill('M26,10 L38,10 L38,22 Q50,28 50,40 A18,18 0 0 1 14,40 Q14,28 26,22Z', K) + line('M26,10 L38,10 M28,10 L28,22 Q14,28 14,40 A18,18 0 0 0 50,40 Q50,28 36,22 L36,10', P, 2.6) + fill('M16,40 L48,40 A16,16 0 0 1 16,40Z', a === P ? '#9be07a' : a) + dot(28, 34, 2, a === P ? '#9be07a' : a, 'g-rise') + dot(36, 30, 1.6, a === P ? '#9be07a' : a, 'g-rise2'),
  candle: (a) => fill('M26,30 L38,30 L38,54 L26,54Z', P) + line('M32,30 L32,26', '#2a1f14', 2) + g('g-flick', fill('M32,8 Q40,18 36,24 Q32,28 28,24 Q24,18 32,8Z', a === P ? '#ffd36b' : a) + dot(32, 21, 2.6, '#fff')) + line('M22,54 L42,54', P, 2.6),
  compass: (a) => dot(32, 32, 20, 'none').replace('fill="none"', `fill="${K}" stroke="${P}" stroke-width="2.6"`) + g('g-sway', fill('M32,14 L37,32 L27,32Z', a === P ? '#e2561b' : a) + fill('M32,50 L37,32 L27,32Z', P)) + dot(32, 32, 2.6, '#1b1222'),
  mirror: (a) => `<ellipse cx="32" cy="28" rx="14" ry="18" fill="${a === P ? '#cfe9f5' : a}" stroke="#c9a050" stroke-width="3"/>` + line('M32,46 L32,56 M24,56 L40,56', '#c9a050', 3) + `<path class="g-shim" d="M24,18 L36,40" stroke="#fff" stroke-width="3" stroke-dasharray="8 40" fill="none"/>`,
  hammer: (a) => g('g-sway', fill('M14,14 L36,14 L36,28 L14,28Z', P) + line('M30,28 L48,50', '#7a5a3a', 5)) + g('g-blink', dot(46, 18, 2, a === P ? '#ffd36b' : a) + dot(52, 26, 1.6, a === P ? '#ffd36b' : a) + dot(42, 10, 1.4, a === P ? '#ffd36b' : a)),
  sparkle: (a) => {
    const s = (x: number, y: number, r: number, cls: string) => fill(`M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r}Z`, a === P ? '#ffd36b' : a, cls);
    return s(30, 32, 18, 'g-pulse') + s(48, 16, 7, 'g-blink') + s(16, 48, 6, 'g-blink2') + s(50, 46, 4, 'g-blink');
  },
  hut: (a) => g('g-pulse', fill('M8,50 A24,24 0 0 1 56,50Z', a === P ? '#cfe9f5' : a, '', 'opacity=".35"')) + fill('M18,50 L18,34 L32,22 L46,34 L46,50Z', P) + fill('M28,50 L28,38 L36,38 L36,50Z', '#ffd36b') + line('M4,50 L60,50', P, 2.4),
  tower: (a) => fill('M22,54 L24,22 L40,22 L42,54Z', P) + fill('M20,22 L20,14 L25,14 L25,18 L29,18 L29,14 L35,14 L35,18 L39,18 L39,14 L44,14 L44,22Z', P) + fill('M29,54 L29,44 A3,3 0 0 1 35,44 L35,54Z', '#1b1222') + g('g-blink', fill('M30,28 L34,28 L34,34 L30,34Z', a === P ? '#ffd36b' : a)) + line('M38,6 L38,14 M38,6 L46,8 L38,10', P, 2),
  berries: (a) => line('M32,10 Q30,18 22,24 M32,10 Q36,18 42,24 M32,10 L32,26', '#5c8a3a', 2.4) + fill('M32,10 Q40,6 46,10 Q40,14 32,10Z', '#8fd16a') + g('g-pulse', dot(22, 32, 7, a === P ? '#d8364e' : a) + dot(42, 32, 7, a === P ? '#d8364e' : a) + dot(32, 42, 8, a === P ? '#d8364e' : a)) + dot(20, 30, 2, '#fff') + dot(30, 39, 2, '#fff'),
  food: (a) => fill('M10,40 Q32,58 54,40Z', P) + fill('M18,40 Q20,26 32,26 Q44,26 46,40Z', '#c98a3e') + line('M24,32 L28,36 M34,30 L38,34', '#8a5a2a', 2) + g('g-rise', line('M24,20 Q22,16 24,12 M32,20 Q30,16 32,12 M40,20 Q38,16 40,12', a === P ? P : a, 2)),
  ankh: (a) => g('g-pulse', dot(32, 32, 22, a === P ? '#ffe69a' : a).replace('/>', ' opacity=".3"/>')) + line('M32,30 L32,56 M20,32 L44,32', P, 5) + `<ellipse cx="32" cy="18" rx="7" ry="10" fill="none" stroke="${P}" stroke-width="5"/>`,
  grave: (a) => fill('M18,54 L18,22 A14,14 0 0 1 46,22 L46,54Z', '#8a8270') + line('M32,22 L32,40 M24,30 L40,30', '#4a4438', 3) + line('M10,54 L54,54', P, 2.6) + g('g-rise', fill('M50,54 L48,44 L46,40 Q46,38 48,38 L50,42 L50,36 Q50,34 52,34 Q54,34 54,36 L54,46 L54,54Z', a === P ? '#a8c89a' : a)),
  cage: (a) => line('M12,14 L52,14 M12,54 L52,54', P, 3.4) + line('M16,14 L16,54 M26,14 L26,54 M38,14 L38,54 M48,14 L48,54', P, 2.4) + g('g-pulse', dot(32, 34, 6, a === P ? '#d6c2ff' : a)),
  maze: (a) => line('M10,10 L54,10 L54,54 L10,54 L10,18 M18,18 L46,18 L46,46 L18,46 L18,26 M26,26 L38,26 L38,38 L26,38', P, 2.6) + dot(32, 32, 2.6, a === P ? '#ffd36b' : a, 'g-blink'),
  chest: (a) => fill('M12,30 L52,30 L52,52 L12,52Z', '#9a6a3a') + fill('M12,30 Q12,16 32,16 Q52,16 52,30Z', '#b07a42') + line('M12,30 L52,30 M24,16 L24,52 M40,16 L40,52', '#5c3a1a', 2) + fill('M29,30 L35,30 L35,38 L29,38Z', a === P ? '#ffd36b' : a) + g('g-blink', dot(48, 10, 2, '#ffd36b') + dot(16, 12, 1.6, '#ffd36b')),
  coins: (a) => [44, 38, 32].map((y) => `<ellipse cx="24" cy="${y}" rx="11" ry="4" fill="${a === P ? '#ffd36b' : a}" stroke="#a87a1a" stroke-width="1.4"/>`).join('') + g('g-float', `<ellipse cx="42" cy="22" rx="9" ry="9" fill="${a === P ? '#ffd36b' : a}" stroke="#a87a1a" stroke-width="1.6"/>`) + fill('M40,18 L44,18 L42,26Z', '#a87a1a'),
  cards: (a) =>
    g('g-fly', `<g transform="rotate(-18 24 34)"><rect x="14" y="20" width="18" height="26" rx="2" fill="${P}"/></g><g transform="rotate(4 34 30)"><rect x="26" y="16" width="18" height="26" rx="2" fill="${P}"/></g><g transform="rotate(22 44 32)"><rect x="36" y="20" width="18" height="26" rx="2" fill="${P}"/></g>`) +
    fill('M44,28 L48,33 L44,38 L40,33Z', a === P ? '#d8364e' : a),
  rope: (a) => line('M32,58 Q28,46 34,36 Q40,26 32,14', a === P ? '#c9a050' : a, 4) + line('M30,50 L36,52 M30,40 L36,42 M32,28 L38,30', '#7a5a2a', 1.6) + g('g-blink', `<ellipse cx="32" cy="10" rx="10" ry="4" fill="#1b1222" stroke="${P}" stroke-width="2"/>`),
  disk: (a) => g('g-float', `<ellipse cx="32" cy="30" rx="22" ry="7" fill="${a === P ? '#cfe9f5' : a}"/>` + fill('M22,24 L30,24 L30,28 L22,28Z M32,20 L42,20 L42,28 L32,28Z', '#9a6a3a')) + line('M20,44 Q32,48 44,44 M24,50 Q32,53 40,50', P, 2, 'g-blink'),
  horse: (a) => fill('M18,54 L22,36 Q18,30 22,24 L18,14 L26,20 Q32,14 40,16 Q50,20 50,30 L44,32 Q40,30 38,34 L40,54Z', a === P ? P : a) + dot(38, 22, 2, '#1b1222') + g('g-sway', line('M24,20 Q16,26 14,36 Q16,40 14,46', a === P ? '#7a6447' : '#7a6447', 3)),
  dragon: (a) => fill('M12,42 Q12,24 28,20 L22,10 L34,18 L40,10 L42,20 Q54,24 54,36 L46,36 L50,44 L38,40 Q30,46 22,44 Z', P) + dot(40, 27, 2.6, '#1b1222') + g('g-flick', fill('M50,40 Q58,44 60,52 Q52,52 46,46Z', a === P ? '#ffb23e' : a)),
  elements: (a) => g('g-spin', fill('M32,8 Q38,16 32,22 Q26,16 32,8Z', '#ffb23e') + fill('M56,32 Q48,38 42,32 Q48,26 56,32Z', '#bfe6ff') + fill('M32,56 Q26,48 32,42 Q38,48 32,56Z', '#a8987e') + fill('M8,32 Q16,26 22,32 Q16,38 8,32Z', '#e4f6ff')) + dot(32, 32, 7, a === P ? P : a),
  summon: (a) => `<ellipse cx="32" cy="48" rx="22" ry="7" fill="none" stroke="${a === P ? '#d8a8ff' : a}" stroke-width="2.6"/>` + g('g-rise', line('M14,44 L14,34 M50,44 L50,34 M22,50 L22,40 M42,50 L42,40', a === P ? '#d8a8ff' : a, 1.8)) + g('g-float', dot(32, 20, 6) + fill('M24,42 L26,30 Q32,26 38,30 L40,42Z', P)),
  animal: (a) => fill('M12,30 L16,14 L24,24 L40,24 L48,14 L52,30 Q52,44 32,52 Q12,44 12,30Z', a === P ? P : a) + g('g-blink', dot(24, 33, 2.6, '#1b1222') + dot(40, 33, 2.6, '#1b1222')) + fill('M28,42 L36,42 L32,46Z', '#1b1222'),
  globe: (a) => dot(32, 32, 20, a === P ? '#7fb2d6' : a) + g('g-spin', line('M32,12 Q20,32 32,52 M32,12 Q44,32 32,52 M12,32 L52,32', P, 2)) + line('M32,32 m-20,0 a20,20 0 1 0 40,0 a20,20 0 1 0 -40,0', P, 2.4),
  coin: (a) => g('g-flip', `<ellipse cx="32" cy="32" rx="16" ry="16" fill="${a === P ? '#ffd36b' : a}" stroke="#a87a1a" stroke-width="2"/>`) + dot(26, 26, 3, '#fff'),
  gravity: (a) => dot(32, 32, 7, '#1b1222') + g('g-spin', line('M32,32 m-18,0 a18,7 0 1 0 36,0 a18,7 0 1 0 -36,0', a === P ? '#d6c2ff' : a, 2.2)) + g('g-fall', line('M14,10 L14,20 M10,16 L14,20 L18,16 M50,10 L50,20 M46,16 L50,20 L54,16', P, 2.2)),
  sand: (a) => g('g-drift', [16, 24, 32, 40, 48].map((x, i) => dot(x, 20 + (i % 2) * 6, 2.2, a === P ? '#e0c890' : a) + dot(x + 4, 34 - (i % 2) * 4, 1.8, a === P ? '#e0c890' : a)).join('')) + fill('M8,52 Q20,40 32,46 Q44,52 56,42 L56,54 L8,54Z', a === P ? '#e0c890' : a),
};

const SPEECH = 'M12,14 L52,14 Q55,14 55,17 L55,38 Q55,41 52,41 L28,41 L18,51 L20,41 L12,41 Q9,41 9,38 L9,17 Q9,14 12,14Z';
const HEART = (x: number, y: number, k: number) => `M${x},${y + 10 * k} C${x - 12 * k},${y + 2 * k} ${x - 14 * k},${y - 5 * k} ${x - 11 * k},${y - 9 * k} C${x - 8 * k},${y - 13 * k} ${x - 2 * k},${y - 12 * k} ${x},${y - 7 * k} C${x + 2 * k},${y - 12 * k} ${x + 8 * k},${y - 13 * k} ${x + 11 * k},${y - 9 * k} C${x + 14 * k},${y - 5 * k} ${x + 12 * k},${y + 2 * k} ${x},${y + 10 * k}Z`;
/** A sword striking down, with what the smite adds drawn where it lands. */
const smiteWith = (impact: string) => line('M32,4 L32,30', '#dfe7ef', 6) + line('M23,9 L41,9', '#c9a050', 4) + line('M32,30 L29,34 L35,34Z', '#dfe7ef', 2) + impact;

// Pictures of their own for the spells cast most often (so they don't look like their neighbours).
Object.assign(MOTIFS, {
  eldritch: (a: string) =>
    g('g-pulse', dot(20, 32, 13, '#2a1838') + line('M20,32 m-13,0 a13,13 0 1 0 26,0 a13,13 0 1 0 -26,0', a === P ? '#d6c2ff' : a, 3)) + dot(20, 32, 4.5, '#fff') + g('g-flash', line('M33,26 L40,20 L44,26 L52,14 M34,32 L44,30 L48,36 L58,32 M33,38 L40,44 L46,40 L52,52', a === P ? '#d6c2ff' : a, 3)),
  healingword: (a: string) => fill(SPEECH, P) + fill(HEART(32, 27, 0.95), a === P ? '#7bc96f' : a, 'g-pulse'),
  masshealingword: (a: string) => fill(SPEECH, P) + g('g-pulse', fill(HEART(21, 28, 0.6), a === P ? '#7bc96f' : a) + fill(HEART(32, 25, 0.7), a === P ? '#7bc96f' : a) + fill(HEART(43, 28, 0.6), a === P ? '#7bc96f' : a)),
  counter: (a: string) => g('g-pulse', fill('M32,14 Q32,32 50,32 Q32,32 32,50 Q32,32 14,32 Q32,32 32,14Z', a === P ? '#d6c2ff' : a)) + line('M32,32 m-20,0 a20,20 0 1 0 40,0 a20,20 0 1 0 -40,0 M18,46 L46,18', '#e2561b', 4.2),
  guardians: (a: string) => {
    const gh = (x: number, y: number) => fill(`M${x - 6},${y + 8} L${x - 6},${y} A6,6 0 0 1 ${x + 6},${y} L${x + 6},${y + 8} L${x + 3},${y + 5} L${x},${y + 8} L${x - 3},${y + 5}Z`, a === P ? '#fff7cf' : a) + dot(x - 2, y, 1.2, '#2a1838') + dot(x + 2, y, 1.2, '#2a1838');
    return line('M32,32 m-20,0 a20,20 0 1 0 40,0 a20,20 0 1 0 -40,0', P, 1.4).replace('/>', ' stroke-dasharray="3 4"/>') + g('g-spin', gh(32, 9) + gh(12, 40) + gh(52, 40)) + dot(32, 27, 4.5) + fill('M25,46 L27,34 Q32,31 37,34 L39,46Z', P);
  },
  huntersmark: (a: string) => line('M32,32 m-18,0 a18,18 0 1 0 36,0 a18,18 0 1 0 -36,0', P, 2.4) + line('M32,6 L32,18 M32,46 L32,58 M6,32 L18,32 M46,32 L58,32', P, 2.6) + g('g-pulse', dot(32, 32, 6, a === P ? '#e2561b' : a)),
  bless: (a: string) => g('g-pulse', `<ellipse cx="32" cy="14" rx="12" ry="4" fill="none" stroke="${a === P ? '#ffe69a' : a}" stroke-width="3"/>`) + dot(32, 27, 6) + fill('M21,56 L23,38 Q32,32 41,38 L43,56Z', P) + g('g-blink', line('M14,22 L18,26 M50,22 L46,26 M10,34 L16,34 M54,34 L48,34', a === P ? '#ffe69a' : a, 2.2)),
  shieldoffaith: (a: string) => fill(shieldPath, K) + line(shieldPath, P, 2.6) + `<path class="g-shim" d="${shieldPath}" fill="none" stroke="#fff" stroke-width="2.6" stroke-dasharray="14 110"/>` + g('g-pulse', `<ellipse cx="32" cy="8" rx="10" ry="3.2" fill="none" stroke="${a === P ? '#ffe69a' : a}" stroke-width="2.6"/>`) + line('M32,22 L32,44 M24,30 L40,30', a === P ? '#ffe69a' : a, 3.4),
  smitedivine: (a: string) => smiteWith(g('g-ring', fill('M32,36 L35,44 L44,42 L37,48 L42,56 L32,51 L22,56 L27,48 L20,42 L29,44Z', a === P ? '#ffe69a' : a)) + line('M14,26 L20,30 M50,26 L44,30 M10,40 L18,40 M54,40 L46,40', a === P ? '#ffe69a' : a, 2.4, 'g-blink')),
  smitefire: (a: string) => smiteWith(g('g-flick', fill('M32,58 C22,58 20,48 26,42 C26,46 29,47 29,47 C28,40 32,34 37,32 C36,38 42,41 42,48 C42,54 38,58 32,58Z', a === P ? '#ffb23e' : a) + fill('M32,57 C28,57 27,52 30,49 C31,52 32,52 32,52 C32,48 34,46 36,45 C36,49 38,50 38,53 C38,56 35,57 32,57Z', '#fff0a8'))),
  smitethunder: (a: string) => smiteWith(g('g-ring', line('M20,40 Q32,32 44,40', a === P ? '#cfe0ff' : a, 2.8)) + g('g-ring2', line('M12,48 Q32,36 52,48', P, 2.6)) + g('g-ring', line('M6,56 Q32,42 58,56', a === P ? '#cfe0ff' : a, 2.4))),
  smitewrath: (a: string) => smiteWith(g('g-shake', fill('M16,42 Q32,34 48,42 Q32,52 16,42Z', P) + dot(32, 43, 4.6, a === P ? '#ffa8d8' : a) + dot(32, 43, 2, '#1b1222') + line('M16,38 L24,40 M48,38 L40,40', '#1b1222', 2.4))),
  smitebrand: (a: string) => smiteWith(g('g-blink', line('M32,38 m-12,0 a12,12 0 1 0 24,0 a12,12 0 1 0 -24,0', a === P ? '#ffe69a' : a, 2.6) + line('M32,30 L32,46 M24,38 L40,38 M26,32 L38,44 M38,32 L26,44', a === P ? '#ffe69a' : a, 1.8))),
  smiteblind: (a: string) => smiteWith(g('g-eye', fill('M14,44 Q32,32 50,44 Q32,56 14,44Z', P) + dot(32, 44, 5, '#1b1222')) + line('M14,54 L50,34', a === P ? '#ffe69a' : a, 3.4)),
  smitestagger: (a: string) => smiteWith(g('g-spin', line('M32,44 m0,-2 a2,2 0 1 1 -2,2 a5,5 0 0 1 5,-5 a8,8 0 0 1 8,8 a11,11 0 0 1 -11,11', a === P ? '#ffa8d8' : a, 2.6)) + g('g-blink', dot(16, 40, 2.2, '#ffd36b') + dot(48, 40, 2.2, '#ffd36b'))),
  smitebanish: (a: string) => smiteWith(`<ellipse cx="32" cy="46" rx="17" ry="8" fill="#1b1222"/>` + g('g-spin', line('M32,46 m-12,0 a12,5 0 1 0 24,0', a === P ? '#d6c2ff' : a, 2.4)) + `<ellipse cx="32" cy="46" rx="17" ry="8" fill="none" stroke="${P}" stroke-width="2.2"/>`),
  smiteshine: (a: string) => smiteWith(g('g-pulse', fill('M32,34 L35,43 L44,46 L35,49 L32,58 L29,49 L20,46 L29,43Z', a === P ? '#fff7cf' : a)) + dot(16, 38, 2, '#fff7cf', 'g-blink') + dot(48, 52, 2, '#fff7cf', 'g-blink2')),
  sacredflame: (a: string) => g('g-blink', line('M32,4 L32,12 M22,6 L26,13 M42,6 L38,13', a === P ? '#ffe69a' : a, 2.4)) + g('g-flick', fill('M32,52 C21,52 19,41 25,34 C25,38 28,40 28,40 C27,31 32,22 38,18 C36,26 45,29 45,40 C45,47 39,52 32,52Z', a === P ? '#ffe69a' : a) + fill(FLAME_IN, '#ffffff')) + line('M18,56 L46,56', P, 2.4),
  toll: (a: string) => g('g-sway', fill('M32,8 Q46,8 46,26 L46,38 L52,44 L12,44 L18,38 L18,26 Q18,8 32,8Z', '#8a8270') + dot(32, 48, 4, '#8a8270') + dot(27, 24, 3, '#1b1222') + dot(37, 24, 3, '#1b1222') + fill('M32,28 L30,32 L34,32Z', '#1b1222')) + g('g-ring', line('M6,18 Q3,28 7,36 M58,18 Q61,28 57,36', a === P ? '#c9a8ff' : a, 2.4)),
  alarm: (a: string) => g('g-sway', fill('M32,8 Q46,8 46,26 L46,38 L52,44 L12,44 L18,38 L18,26 Q18,8 32,8Z', a === P ? '#ffd36b' : a) + dot(32, 48, 4, a === P ? '#ffd36b' : a) + line('M32,18 L32,30', '#1b1222', 4) + dot(32, 36, 2.4, '#1b1222')) + line('M7,18 Q4,28 8,36 M57,18 Q60,28 56,36', P, 2.2, 'g-blink'),
  firebolt: (a: string) => g('g-fly', line('M8,48 Q20,44 30,36 M10,40 Q20,38 28,32 M14,54 Q24,50 32,42', a === P ? '#ffb23e' : a, 2.6) + dot(40, 28, 11, a === P ? '#ffb23e' : a) + dot(42, 26, 6, '#fff0a8')),
  bonehand: (a: string) => g('g-float', line('M26,54 L26,34 M26,34 L18,24 M26,34 L24,14 M30,34 L32,10 M34,34 L40,14 M36,36 L46,24 M22,54 L40,54 L40,36 L22,36Z', a === P ? '#e4eef5' : a, 3.2) + dot(24, 14, 2.4, a === P ? '#e4eef5' : a) + dot(32, 10, 2.4, a === P ? '#e4eef5' : a) + dot(40, 14, 2.4, a === P ? '#e4eef5' : a)),
  vampire: (a: string) => fill('M10,20 Q32,10 54,20 L50,26 Q32,20 14,26Z', P) + fill('M20,24 L24,38 L28,25Z M36,25 L40,38 L44,24Z', P) + g('g-fall', fill('M24,42 Q20,50 24,54 Q28,50 24,42Z M40,42 Q36,50 40,54 Q44,50 40,42Z', a === P ? '#d8364e' : a)),
  barbs: (a: string) => g('g-spin', [0, 72, 144, 216, 288].map((r) => `<g transform="rotate(${r} 32 32)">${fill('M32,8 L35,18 L32,16 L29,18Z', '#dfe7ef')}</g>`).join('')) + g('g-pulse', fill('M32,22 L36,32 L32,42 L28,32Z', a === P ? '#dfe7ef' : a)),
  absorb: (_a: string) => g('g-spin', fill('M32,8 Q38,14 32,20 Q26,14 32,8Z', '#ffb23e') + fill('M56,32 Q50,38 44,32 Q50,26 56,32Z', '#bfe6ff') + fill('M32,56 Q26,50 32,44 Q38,50 32,56Z', '#fff6a8') + fill('M8,32 Q14,26 20,32 Q14,38 8,32Z', '#b8f06a')) + fill('M32,22 L42,26 L42,33 C42,39 37,43 32,45 C27,43 22,39 22,33 L22,26Z', P),
  rebuke: (a: string) => g('g-flick', fill(FLAME_OUT, a === P ? '#ffb23e' : a) + fill(FLAME_IN, '#fff0a8')) + fill('M22,20 L18,6 L28,16Z M42,20 L46,6 L36,16Z', '#8b2a1c') + dot(28, 38, 2, '#8b2a1c') + dot(36, 38, 2, '#8b2a1c'),
  spiritweapon: (a: string) => g('g-float', line('M18,50 L40,24', '#c9a050', 4) + fill('M36,12 L50,10 L52,24 L44,30 L34,22Z', a === P ? '#d6c2ff' : a) + line('M38,14 L48,24 M44,12 L50,18', '#fff', 1.6)) + g('g-blink', dot(14, 20, 2, a === P ? '#d6c2ff' : a) + dot(54, 40, 2, a === P ? '#d6c2ff' : a)) + `<ellipse cx="44" cy="20" rx="14" ry="14" fill="none" stroke="${a === P ? '#d6c2ff' : a}" stroke-width="1.4" opacity=".6"/>`,
  boomblade: (a: string) => g('g-shim2', fill('M30,8 L35,14 L35,40 L25,40 L25,14Z', '#dfe7ef')) + line('M18,42 L42,42', '#c9a050', 4) + line('M30,44 L30,54', '#7a5a3a', 4) + g('g-ring', line('M42,18 A12,12 0 0 1 42,34', a === P ? '#cfe0ff' : a, 2.6)) + g('g-ring2', line('M48,12 A20,20 0 0 1 48,40', P, 2.2)),
  greenflameblade: (_a: string) => fill('M22,8 L27,14 L27,40 L17,40 L17,14Z', '#dfe7ef') + line('M10,42 L34,42', '#c9a050', 4) + line('M22,44 L22,54', '#7a5a3a', 4) + g('g-flick', fill('M44,48 C36,48 34,40 38,34 C38,38 41,39 41,39 C40,32 44,26 48,22 C47,29 54,31 54,39 C54,45 50,48 44,48Z', '#6ee06e') + fill('M44,47 C40,47 40,42 42,40 C43,42 44,42 44,42 C44,38 46,36 48,35 C48,39 50,40 50,43 C50,46 47,47 44,47Z', '#e8ffd0')),
  haste: (a: string) => g('g-drift', line('M6,24 L18,24 M4,32 L16,32 M8,40 L18,40', a === P ? '#ffd36b' : a, 2.6)) + dot(38, 16, 6) + fill('M30,24 L44,24 L46,36 L52,46 L46,48 L40,38 L36,46 L42,56 L36,58 L28,44 L32,34Z', P),
  frog: (a: string) => g('g-float', fill('M12,44 Q12,26 32,26 Q52,26 52,44 Q52,52 32,52 Q12,52 12,44Z', a === P ? '#7bc96f' : a) + dot(22, 26, 7, a === P ? '#7bc96f' : a) + dot(42, 26, 7, a === P ? '#7bc96f' : a) + dot(22, 25, 3.4, '#fff') + dot(42, 25, 3.4, '#fff') + dot(22, 25, 1.8, '#1b1222') + dot(42, 25, 1.8, '#1b1222') + line('M24,42 Q32,46 40,42', '#2f5e22', 2)) + g('g-blink', fill('M52,10 Q52,16 58,16 Q52,16 52,22 Q52,16 46,16 Q52,16 52,10Z', '#ffd36b')),
  invisible: (a: string) => g('g-blink', `<circle cx="32" cy="19" r="6" fill="none" stroke="${P}" stroke-width="2.2" stroke-dasharray="3 3"/><path d="M21,52 L23,32 Q32,26 41,32 L43,52Z" fill="none" stroke="${P}" stroke-width="2.2" stroke-dasharray="3 3"/>`) + g('g-blink2', dot(14, 18, 1.8, a === P ? '#ffd36b' : a) + dot(50, 26, 1.6, a === P ? '#ffd36b' : a) + dot(48, 48, 1.8, a === P ? '#ffd36b' : a)),
  command: (a: string) => fill(SPEECH, P) + g('g-blink', line('M32,20 L32,30', a === P ? '#9a3b6b' : a, 5) + dot(32, 36, 2.8, a === P ? '#9a3b6b' : a)),
  bane: (a: string) => g('g-fall', line('M32,10 L32,40 M22,30 L32,40 L42,30', a === P ? '#c9a8ff' : a, 4)) + line('M14,48 L50,48', P, 2.6) + g('g-blink', dot(18, 54, 2, P) + dot(32, 56, 2, P) + dot(46, 54, 2, P)),
  aid: (a: string) => g('g-pulse', fill(HEART(32, 30, 1.3), a === P ? '#ff8fa8' : a)) + line('M32,22 L32,38 M24,30 L40,30', '#fff', 4),
  cure: (a: string) => g('g-pulse', fill(HEART(32, 30, 1.45), a === P ? '#7bc96f' : a)) + line('M22,28 Q24,22 30,21', '#fff', 2.2),
  heal: (a: string) => g('g-spin', [0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<g transform="rotate(${r} 32 32)">${line('M32,4 L32,10', a === P ? '#c8f5b0' : a, 2.4)}</g>`).join('')) + g('g-pulse', fill(HEART(32, 31, 1.2), a === P ? '#7bc96f' : a)) + line('M32,23 L32,37 M25,30 L39,30', '#fff', 3.4),
  spikes: (a: string) => fill('M6,52 L58,52 L58,56 L6,56Z', '#7a5a3a') + g('g-grow', fill('M8,52 L12,36 L16,52Z M18,52 L23,30 L28,52Z M30,52 L34,38 L38,52Z M40,52 L45,32 L50,52Z M50,52 L54,40 L58,52Z', a === P ? '#a8c89a' : a)) + line('M14,22 L18,18 M44,18 L48,22', P, 2),
  guidance: (a: string) => fill('M20,58 L18,40 L12,32 Q10,28 14,28 L20,34 L20,22 Q20,19 23,19 Q26,19 26,22 L26,32 L26,18 Q26,15 29,15 Q32,15 32,18 L32,32 L32,20 Q32,17 35,17 Q38,17 38,20 L38,34 L38,26 Q38,23 41,23 Q44,23 44,26 L44,42 Q44,52 38,58Z', P) + g('g-pulse', fill('M46,4 L48,11 L55,13 L48,15 L46,22 L44,15 L37,13 L44,11Z', a === P ? '#ffe69a' : a)),
  guidingbolt: (a: string) => g('g-fly', line('M8,52 L36,28', a === P ? '#ffe69a' : a, 3.4) + line('M12,58 L34,38 M6,44 L28,26', a === P ? '#ffe69a' : a, 1.8) + fill('M44,8 L47,18 L57,21 L47,24 L44,34 L41,24 L31,21 L41,18Z', a === P ? '#fff7cf' : a)),
  faeriefire: (a: string) => person('#1b1222').replace(/fill="#1b1222"/g, `fill="#1b1222" stroke="${a === P ? '#ff8fe0' : a}" stroke-width="2"`) + g('g-blink', dot(18, 20, 2, a === P ? '#ff8fe0' : a) + dot(46, 28, 2, '#8fe0ff') + dot(16, 44, 1.6, '#ffe69a') + dot(48, 48, 2, a === P ? '#ff8fe0' : a)) + g('g-blink2', dot(40, 12, 1.6, '#8fe0ff') + dot(24, 34, 1.4, '#ffe69a') + dot(52, 38, 1.4, a === P ? '#ff8fe0' : a)),
  thunderwave: (a: string) => fill('M8,22 L22,22 L22,42 L8,42Z', P) + g('g-ring', line('M28,18 Q36,32 28,46', a === P ? '#cfe0ff' : a, 3)) + g('g-ring2', line('M38,12 Q48,32 38,52', P, 2.8)) + g('g-ring', line('M48,8 Q60,32 48,56', a === P ? '#cfe0ff' : a, 2.4)),
  shatter: (a: string) => g('g-shake', fill('M32,12 L44,22 L40,40 L32,52 L22,40 L20,22Z', a === P ? '#cfe0ff' : a) + line('M32,12 L30,28 L22,40 M30,28 L40,40 M30,28 L44,22', '#1b1222', 1.6)) + g('g-ring', line('M10,24 Q6,32 10,40 M54,24 Q58,32 54,40', P, 2.4)) + g('g-rise', fill('M14,12 L18,14 L15,17Z M50,10 L52,15 L47,14Z', a === P ? '#cfe0ff' : a)),
  catapult: (a: string) =>
    g('g-fly', dot(38, 28, 14, a === P ? '#a8987e' : a) + line('M30,22 L40,30 L48,24 M38,30 L36,40', '#5c4f3c', 2.2)) + g('g-drift', line('M4,40 Q12,36 22,36 M6,48 Q16,44 26,42 M10,56 Q18,52 28,48', P, 2.6)),
});

/** A spell's element → its accent colour (parchment for none). */
export const ELEMENT_ACCENT: Record<string, string> = {
  fire: '#ffb23e',
  cold: '#bfe6ff',
  lightning: '#fff6a8',
  thunder: '#cfe0ff',
  radiant: '#ffe69a',
  necrotic: '#c9a8ff',
  acid: '#b8f06a',
  poison: '#9be07a',
  psychic: '#ffa8d8',
  force: '#d6c2ff',
  heal: '#c8f5b0',
};

export { P as PARCHMENT };
