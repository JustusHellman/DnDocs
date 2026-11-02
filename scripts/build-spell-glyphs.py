"""Builds src/data/spell-glyphs.json from scripts/spell-glyphs.txt: each spell's picture, element
(from its damage type or healing unless the line says otherwise) and optional small badge."""
import json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
motifs = set(re.findall(r"^  ([a-z]+)(?:: \(a[:)]|,$)", (root / 'src/lib/play/glyphMotifs.ts').read_text(), re.M))
elements = {'fire', 'cold', 'lightning', 'thunder', 'radiant', 'necrotic', 'acid', 'poison', 'psychic', 'force', 'heal', 'none'}

spells = {}
for f in ['spells-2014', 'spells-2024', 'spells-extra']:
    for s in json.loads((root / f'src/data/{f}.json').read_text()):
        spells.setdefault(s['i'].removeprefix('xb-'), s)

def element_of(s):
    ty = ((s.get('dm') or {}).get('ty') or '').lower()
    if ty in elements:
        return ty
    return 'heal' if s.get('he') else 'none'

out, problems = {}, []
for n, raw in enumerate((root / 'scripts/spell-glyphs.txt').read_text().splitlines(), 1):
    raw = raw.split('#')[0].strip()
    if not raw:
        continue
    parts = raw.split()
    sid, motif, rest = parts[0], parts[1], parts[2:]
    badge = next((p[1:] for p in rest if p.startswith('+')), None)
    el = next((p for p in rest if not p.startswith('+')), None)
    if sid not in spells: problems.append(f'line {n}: unknown spell {sid}')
    if sid in out: problems.append(f'line {n}: {sid} twice')
    for m in [motif] + ([badge] if badge else []):
        if m not in motifs: problems.append(f'line {n}: unknown motif {m}')
    if el and el not in elements: problems.append(f'line {n}: unknown element {el}')
    el = el or (element_of(spells[sid]) if sid in spells else 'none')
    out[sid] = [motif, '' if el == 'none' else el] + ([badge] if badge else [])

missing = sorted(set(spells) - set(out))
if missing: problems.append('no picture: ' + ', '.join(missing))
if problems:
    print('\n'.join(problems)); sys.exit(1)
(root / 'src/data/spell-glyphs.json').write_text(json.dumps(out, separators=(',', ':'), sort_keys=True) + '\n')
used = {v[0] for v in out.values()} | {v[2] for v in out.values() if len(v) > 2}
print(f'{len(out)} spells, {len(used)} of {len(motifs)} pictures used; unused: {sorted(motifs - used)}')
