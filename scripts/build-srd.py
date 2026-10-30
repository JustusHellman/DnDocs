#!/usr/bin/env python3
"""Builds the compact SRD data DnDocs ships (spells and class tables) from the 5e-bits/5e-database
JSON (SRD 5.1 and SRD 5.2.1, both CC-BY-4.0 by Wizards of the Coast).

  python3 scripts/build-srd.py <folder with 5e-database src/2014/en and src/2024/en files>

Writes src/data/spells-2014.json, spells-2024.json, classes-2014.json, classes-2024.json.
"""
import json, os, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'srd'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data')
FULL = {'bard', 'cleric', 'druid', 'sorcerer', 'wizard'}
HALF = {'paladin', 'ranger'}
ABILITY = {'Strength': 'str', 'Dexterity': 'dex', 'Constitution': 'con', 'Intelligence': 'int', 'Wisdom': 'wis', 'Charisma': 'cha'}


def load(ed, name):
    for p in (os.path.join(SRC, f'{ed}-{name}.json'), os.path.join(SRC, ed, 'en', f'5e-SRD-{name}.json')):
        if os.path.exists(p):
            return json.load(open(p, encoding='utf-8'))
    raise SystemExit(f'missing {ed} {name}')


def area_from_text(text, rng):
    """The area as written in standard SRD phrasing ("20-foot-radius Sphere", "15-foot Cone",
    "100-foot-long, 5-foot-wide Line", "Self (30-foot cone)")."""
    t = f'{rng} {text}'
    m = re.search(r'(\d+)-foot-long(?:,| and)? (\d+)-foot-wide Line', t, re.I) or re.search(r'Line (?:that is )?(\d+) feet long and (\d+) feet wide', t, re.I)
    if m:
        return {'k': 'line', 'f': int(m.group(1)), 'w': int(m.group(2))}
    m = re.search(r'(\d+)-foot(?:-radius|-radius,)?[ -](?:\d+-foot-high )?(sphere|cube|cone|cylinder|emanation|radius)', t, re.I)
    if m:
        k = m.group(2).lower()
        k = {'radius': 'sphere', 'emanation': 'sphere'}.get(k, k)
        return {'k': k, 'f': int(m.group(1))}
    return None


def save_from_text(text):
    m = re.search(r'(?:make|makes|succeed on) an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw', text)
    return ABILITY[m.group(1)] if m else None


def spells(ed):
    out = []
    for s in load(ed, 'Spells'):
        desc = s.get('desc') or s.get('description') or ''
        text = '\n\n'.join(desc) if isinstance(desc, list) else desc
        hl = s.get('higher_level') or ''
        higher = '\n\n'.join(hl) if isinstance(hl, list) else hl
        o = {
            'i': s['index'], 'n': s['name'], 'l': s['level'], 's': s['school']['name'],
            'c': [c['index'] for c in s.get('classes', [])],
            't': s['casting_time'], 'r': s['range'], 'v': ''.join(s.get('components', [])),
            'd': s['duration'], 'x': text.strip(),
        }
        if s.get('material'): o['m'] = s['material']
        if s.get('concentration'): o['k'] = 1
        if s.get('ritual'): o['ri'] = 1
        if higher: o['h'] = higher.strip()
        aoe = s.get('area_of_effect')
        a = {'k': aoe['type'], 'f': aoe['size']} if aoe else area_from_text(text, s['range'])
        if a:
            if a['k'] == 'line' and 'w' not in a:
                m = re.search(r'(\d+) feet wide|(\d+)-foot-wide', text)
                a['w'] = int(m.group(1) or m.group(2)) if m else 5
            o['a'] = a
        dmg = s.get('damage')
        if isinstance(dmg, list):
            dmg = dmg[0] if dmg else None
        if dmg:
            dd = {'ty': (dmg.get('damage_type') or {}).get('name', '')}
            if dmg.get('damage_at_slot_level'): dd['at'] = dmg['damage_at_slot_level']
            if dmg.get('damage_at_character_level'): dd['cl'] = dmg['damage_at_character_level']
            # SRD 5.2.1 lists only the base dice: work out the rest from "increases by 1d6 for each spell slot level above 3".
            if 'at' in dd and len(dd['at']) == 1 and s['level'] > 0:
                m = re.search(r'(\d+)d(\d+) for each (?:spell )?slot level above (\d+)', higher + ' ' + text)
                base = list(dd['at'].values())[0]
                bm = re.match(r'(\d+)d(\d+)(.*)', base)
                if m and bm and m.group(2) == bm.group(2):
                    lo = int(m.group(3))
                    dd['at'] = {str(l): f'{int(bm.group(1)) + int(m.group(1)) * (l - lo)}d{bm.group(2)}{bm.group(3)}' for l in range(lo, 10)}
            if s['level'] == 0 and 'at' in dd and 'cl' not in dd:
                m = re.search(r'levels? 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)', higher + ' ' + text)
                base = list(dd['at'].values())[0]
                if m:
                    dd['cl'] = {'1': base, '5': m.group(1), '11': m.group(2), '17': m.group(3)}
                    del dd['at']
            o['dm'] = dd
        heal = s.get('heal_at_slot_level')
        if heal:
            o['he'] = heal
        else:
            m = re.search(r'regains? (?:a number of )?Hit Points equal to (\d+d\d+)( plus your spellcasting ability modifier)?', text, re.I)
            if m and s['level'] > 0:
                base = int(m.group(1).split('d')[0]); die = m.group(1).split('d')[1]
                inc = re.search(r'(\d+)d(\d+) for each (?:spell )?slot level above (\d+)', higher + ' ' + text)
                mod = ' + MOD' if m.group(2) else ''
                if inc and inc.group(2) == die:
                    lo = int(inc.group(3))
                    o['he'] = {str(l): f'{base + int(inc.group(1)) * (l - lo)}d{die}{mod}' for l in range(lo, 10)}
                else:
                    o['he'] = {str(s['level']): f'{m.group(1)}{mod}'}
        dc = s.get('dc')
        sv = dc['dc_type']['index'] if dc else save_from_text(text)
        if sv: o['sv'] = sv
        if dc and dc.get('dc_success'): o['sh'] = dc['dc_success']
        elif sv and re.search(r'half as much damage', text): o['sh'] = 'half'
        if s.get('attack_type'): o['at'] = s['attack_type']
        out.append(o)
    out.sort(key=lambda o: (o['l'], o['n']))
    return out


def classes(ed):
    out = {}
    for c in load(ed, 'Classes'):
        i = c['index']
        sc = c.get('spellcasting') or {}
        ab = (sc.get('spellcasting_ability') or {}).get('index')
        out[i] = {'n': c['name'], 'hd': c['hit_die'], 'ab': ab, 'cast': 'full' if i in FULL else 'half' if i in HALF else 'pact' if i == 'warlock' else None, 'lv': [None] * 20}
    for l in load(ed, 'Levels'):
        if l.get('subclass'): continue
        i, n = l['class']['index'], l['level']
        sp = l.get('spellcasting') or {}
        e = {'pb': l.get('prof_bonus')}
        slots = [sp.get(f'spell_slots_level_{k}', 0) or 0 for k in range(1, 10)]
        if i == 'warlock' and any(slots):
            k = max(j for j in range(9) if slots[j])
            e['pact'] = [slots[k], k + 1]
        elif any(slots):
            while slots and not slots[-1]: slots.pop()
            e['s'] = slots
        for key, short in (('cantrips_known', 'ca'), ('spells_known', 'kn'), ('prepared_spells', 'pr')):
            if sp.get(key): e[short] = sp[key]
        cs = {k: v for k, v in (l.get('class_specific') or {}).items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
        if cs: e['cs'] = cs
        out[i]['lv'][n - 1] = e
    return out


os.makedirs(OUT, exist_ok=True)
for ed in ('2014', '2024'):
    for name, data in (('spells', spells(ed)), ('classes', classes(ed))):
        p = os.path.join(OUT, f'{name}-{ed}.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(p, os.path.getsize(p), len(data))
