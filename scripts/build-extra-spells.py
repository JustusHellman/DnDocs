#!/usr/bin/env python3
"""
Spells that aren't in the free SRD, as facts only (level, school, casting time, range,
components, duration, area, dice, save or attack, classes, book): no rules text. The cards say
which book has the description.

Input: scripts/spell-facts/*.jsonl (one spell per line, collected from public spell lists).
Output: src/data/spells-extra.json — each spell marked for the rules edition(s) it fills in:
  "e": "2014" = only missing from the 2014 SRD (the 2024 SRD has its own version), else both.
The 2024 rules also get the two 2014 SRD spells the 2024 SRD dropped (as facts only).

  python3 scripts/build-extra-spells.py
"""
import glob, json, os, re

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
srd14 = json.load(open(os.path.join(root, 'src/data/spells-2014.json')))
srd24 = json.load(open(os.path.join(root, 'src/data/spells-2024.json')))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
in14 = {norm(s['n']) for s in srd14}
in24 = {norm(s['n']) for s in srd24}

BOOKS = {
    "Player's Handbook": 'PHB',
    "Xanathar's Guide to Everything": "Xanathar's",
    "Tasha's Cauldron of Everything": "Tasha's",
    "Explorer's Guide to Wildemount": 'Wildemount',
    "Fizban's Treasury of Dragons": "Fizban's",
    'Strixhaven: A Curriculum of Chaos': 'Strixhaven',
    'Acquisitions Inc.': 'Acquisitions Inc.',
    'Acquisitions Incorporated': 'Acquisitions Inc.',
    'Lost Laboratory of Kwalish': 'Kwalish',
    'The Book of Many Things': 'Book of Many Things',
    "Elemental Evil Player's Companion": 'Elemental Evil',
    "Sword Coast Adventurer's Guide": 'Sword Coast',
    "Guildmaster's Guide to Ravnica": 'Ravnica',
    'Icewind Dale: Rime of the Frostmaiden': 'Icewind Dale',
    'Icewind Dale - Rime of the Frostmaiden': 'Icewind Dale',
}
def book(src):
    first = (src or '').split('/')[0].strip()
    for k, v in BOOKS.items():
        if first.startswith(k.split(':')[0]):
            return v
    if first.startswith('Spelljammer'): return 'Spelljammer'
    if first.startswith('Planescape'): return 'Planescape'
    return first[:40] or 'a sourcebook'

DICE = re.compile(r'^(\d+)d(\d+)$')
def scale(base, per, lvl):
    out = {str(lvl): base}
    b, p = DICE.match(base or ''), DICE.match(per or '')
    if b and p:
        for l in range(lvl + 1, 10):
            if p.group(2) == b.group(2):
                out[str(l)] = f"{int(b.group(1)) + int(p.group(1)) * (l - lvl)}d{b.group(2)}"
            else:
                out[str(l)] = f"{base}+{int(p.group(1)) * (l - lvl)}d{p.group(2)}"
    return out

def slug(n):
    return 'xb-' + re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', n.lower().replace("'", ''))).strip('-')

def tidy_time(t):
    t = (t or '1 action').strip()
    t = re.sub(r',.*$', '', t)  # "1 reaction, which you take when…" → "1 reaction"
    return t[:40].lower()

def convert(r):
    lvl = int(r['level'])
    sp = {
        'i': slug(r['name']), 'n': r['name'], 'l': lvl, 's': (r.get('school') or 'evocation').split()[0].capitalize(),
        'c': sorted({c.lower() for c in (r.get('classes') or [])}),
        't': tidy_time(r.get('casting_time')), 'r': (r.get('range') or '—')[:40],
        'v': re.sub(r'[^VSM]', '', (r.get('components') or '').upper()), 'd': (r.get('duration') or 'Instantaneous')[:60],
        'x': '', 'ref': book(r.get('source')), 'xs': 1,
    }
    if r.get('material'): sp['m'] = str(r['material'])[:120]
    if r.get('concentration') or re.search(r'concentration', sp['d'], re.I): sp['k'] = 1
    if r.get('ritual'): sp['ri'] = 1
    a = r.get('area')
    if a and a.get('shape') in ('sphere', 'cube', 'cone', 'line', 'cylinder') and a.get('feet'):
        sp['a'] = {'k': a['shape'], 'f': int(a['feet'])}
        if a['shape'] == 'line': sp['a']['w'] = int(a.get('width') or 5)
    if r.get('damage_dice') or r.get('cantrip_dice'):
        dm = {'ty': (r.get('damage_type') or '').capitalize()}
        if lvl == 0:
            cl = {'1': r.get('damage_dice')} if r.get('damage_dice') else {}
            cl.update({k: v for k, v in (r.get('cantrip_dice') or {}).items() if v})
            if cl: dm['cl'] = cl
        elif r.get('damage_dice'):
            dm['at'] = scale(r['damage_dice'], r.get('dice_per_slot'), lvl)
        if 'cl' in dm or 'at' in dm: sp['dm'] = dm
    if r.get('heal_dice'):
        he = scale(r['heal_dice'], r.get('dice_per_slot') if not r.get('damage_dice') else None, max(1, lvl))
        sp['he'] = {k: (v + ' + MOD' if r.get('heal_adds_mod') else v) for k, v in he.items()}
    if r.get('save_ability') in ('str', 'dex', 'con', 'int', 'wis', 'cha'):
        sp['sv'] = r['save_ability']
        if r.get('half_on_save'): sp['sh'] = 'half'
    if r.get('spell_attack') in ('ranged', 'melee'): sp['at'] = r['spell_attack']
    return sp

out, seen = [], set()
for f in sorted(glob.glob(os.path.join(here, 'spell-facts', '*.jsonl'))):
    for line in open(f):
        if not line.strip(): continue
        r = json.loads(line)
        k = norm(r['name'])
        if k in seen or (k in in14 and k in in24): continue
        seen.add(k)
        sp = convert(r)
        if k in in24: sp['e'] = '2014'   # the 2024 SRD has its own version
        elif k in in14: sp['e'] = '2024'
        out.append(sp)

# 2014 SRD spells the 2024 SRD dropped: facts only, for 2024 campaigns.
for s in srd14:
    if norm(s['n']) in in24 or norm(s['n']) in seen: continue
    sp = {k: v for k, v in s.items() if k not in ('x', 'h')}
    sp.update({'i': 'xb-' + s['i'], 'x': '', 'ref': 'SRD 5.1 (2014 rules)', 'xs': 1, 'e': '2024'})
    out.append(sp)

out.sort(key=lambda s: (s['l'], s['n']))
json.dump(out, open(os.path.join(root, 'src/data/spells-extra.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'spells;', sum(1 for s in out if s.get('e') == '2014'), 'only for 2014;', sum(1 for s in out if s.get('e') == '2024'), 'only for 2024')
