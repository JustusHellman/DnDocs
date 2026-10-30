/**
 * One character at the table: its setup, what's used, what's worked out from both, and the
 * actions (use a slot, rest, concentrate…). Used by the token card, the character page, the chat's
 * "My character" panel and the chat commands.
 */
import { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { Entity } from '../../types';
import { tableChat } from '../chat/bus';
import { setPlayDef, updateCharacterHp } from '../entityService';
import { applyHp, hpToAttributes, readHp, writeDeathSaves } from '../hitPoints';
import { patchPlay, setPlay, useTableLive } from './live';
import { concentrationDC, derive, hitDiceLeft, hitDieLeft, longRest, ordinal, pactLeft, playKey, resourceLeft, shortRest, slotsLeft, type Derived, type Edition, type PlayDef, type PlayLive, type Resource } from './model';

export interface PlayerApi {
  entity: Entity;
  key: string;
  def: PlayDef;
  live: PlayLive;
  d: Derived;
  edition: Edition;
  canEdit: boolean;
  owner: string;
  /** Change used counts directly (pips). */
  setSlotUsed: (level: number, used: number) => Promise<void>;
  setPactUsed: (used: number) => Promise<void>;
  setResUsed: (r: Resource, used: number) => Promise<void>;
  setConc: (on: boolean, spell?: string, quiet?: boolean) => Promise<void>;
  setReact: (on: boolean) => Promise<void>;
  /** Use one (with a line in the chat that can be undone). Returns false when none are left. */
  spendSlot: (level: number, why?: string) => Promise<boolean>;
  spendPact: (why?: string) => Promise<boolean>;
  spendRes: (r: Resource, n?: number, why?: string) => Promise<boolean>;
  regainRes: (r: Resource, n?: number) => Promise<void>;
  /** Spend one hit die on a short rest: `total` is what it healed (die + CON, rolled or typed). */
  spendHitDie: (die: number, total: number) => Promise<void>;
  shortRest: () => Promise<void>;
  /** Took damage: if concentrating, the chat asks for the Constitution save. */
  damaged: (amount: number) => Promise<void>;
  /** Regain a spell slot (the /regain command). */
  regainSlot: (level: number) => Promise<void>;
  longRest: (opts?: { party?: boolean; quiet?: boolean }) => Promise<void>;
  saveDef: (next: PlayDef) => Promise<void>;
}

/** The Constitution save bonus (proficient for barbarians, fighters and sorcerers as their first class). */
export function conSave(d: Derived) {
  return d.mods.con + (['barbarian', 'fighter', 'sorcerer'].includes(d.classes[0]?.cls ?? '') ? d.pb : 0);
}

export function readDef(entity: Entity | null | undefined): PlayDef {
  const v = entity?.attributes?.play;
  return v && typeof v === 'object' ? (v as PlayDef) : {};
}

export function usePlayer(entity: Entity | null | undefined): PlayerApi | null {
  const { currentCampaign, user, isDM } = useAuth();
  const toast = useToast();
  const table = useTableLive();
  const edition: Edition = currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014';
  const def = readDef(entity);
  const d = useMemo(
    () => derive({ classLevel: entity?.attributes?.classLevel, stats: entity?.dndStats ?? undefined, def, edition }),
    [entity?.attributes?.classLevel, entity?.dndStats, JSON.stringify(def), edition], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!entity || !currentCampaign || !user) return null;
  const cid = currentCampaign.id;
  const key = playKey(entity.id);
  const live = table.play[key] ?? {};
  const owner = entity.playerId || currentCampaign.dmId;
  const canEdit = isDM || entity.playerId === user.uid;
  const name = entity.name;
  const who = name.split(' ')[0];
  const fail = (what: string) => (err: unknown) => {
    toast.error(err, what);
    throw err;
  };
  const patch = (p: Record<string, unknown>, what = 'Tracker') => patchPlay(cid, key, owner, name, p).catch(fail(what));
  /** A line in the chat with an Undo (the undo puts the old value back and removes the line). */
  const announce = async (what: string, left: number, of: number, path: string, was: number) => {
    await tableChat.event({ t: 'use', who, what, left, of, undo: { key, path, was } });
  };

  const api: PlayerApi = {
    entity,
    key,
    def,
    live,
    d,
    edition,
    canEdit,
    owner,
    setSlotUsed: (level, used) => patch({ [`s/${level}`]: used > 0 ? Math.min(used, 20) : null }, 'Spell slot'),
    setPactUsed: (used) => patch({ p: used > 0 ? used : null }, 'Pact slot'),
    setResUsed: (r, used) => patch({ [`r/${r.key}`]: used > 0 ? Math.min(used, 999) : null }, r.name),
    setConc: async (on, spell, quiet) => {
      await patch({ conc: on ? 1 : null, cs: on && spell ? spell.slice(0, 80) : null }, 'Concentration');
      if (!quiet && (!!live.conc !== on || (on && spell && spell !== live.cs))) await tableChat.event({ t: 'concon', who, on, ...(spell ? { spell } : {}) });
    },
    setReact: (on) => patch({ re: on ? 1 : null }, 'Reaction'),
    spendSlot: async (level, why) => {
      const left = slotsLeft(d, live, level);
      if (!left) return false;
      const was = live.s?.[String(level)] ?? 0;
      await patch({ [`s/${level}`]: was + 1 }, 'Spell slot');
      if (why !== 'quiet') await announce(`a ${ordinal(level)}-level slot${why ? ` (${why})` : ''}`, left - 1, d.slots[level - 1] ?? 0, `s/${level}`, was);
      return true;
    },
    spendPact: async (why) => {
      const left = pactLeft(d, live);
      if (!left || !d.pact) return false;
      const was = live.p ?? 0;
      await patch({ p: was + 1 }, 'Pact slot');
      if (why !== 'quiet') await announce(`a pact slot (${ordinal(d.pact.l)})${why ? ` (${why})` : ''}`, left - 1, d.pact.n, 'p', was);
      return true;
    },
    spendRes: async (r, n = 1, why) => {
      const left = resourceLeft(r, live);
      if (left < n) return false;
      const was = live.r?.[r.key] ?? 0;
      await patch({ [`r/${r.key}`]: was + n }, r.name);
      if (why !== 'quiet') await announce(`${r.pool ? `${n} ` : ''}${r.name}${why ? ` (${why})` : ''}`, left - n, r.max, `r/${r.key}`, was);
      return true;
    },
    regainRes: async (r, n = 1) => {
      const was = live.r?.[r.key] ?? 0;
      const used = Math.max(0, was - n);
      await patch({ [`r/${r.key}`]: used || null }, r.name);
      await tableChat.event({ t: 'use', who, what: `${r.pool ? `${n} ` : ''}${r.name}`, left: r.max - used, of: r.max, back: 1, undo: { key, path: `r/${r.key}`, was } });
    },
    spendHitDie: async (die, total) => {
      if (!hitDieLeft(d, live, die)) return;
      await patch({ [`h/${die}`]: (live.h?.[String(die)] ?? 0) + 1 }, 'Hit dice');
      const before = readHp(entity.attributes, entity.dndStats?.hitPoints);
      const after = applyHp(before, 'heal', Math.max(0, total));
      await updateCharacterHp(entity.id, hpToAttributes(after)).catch(fail('Hit points'));
      await tableChat.event({ t: 'hd', who, die, total: Math.max(0, total), hp: after.max ? `${after.current}/${after.max}` : String(after.current ?? '') });
    },
    damaged: async (amount) => {
      if (!live.conc || amount <= 0) return;
      await tableChat.event({ t: 'conc', who, key, owner, dmg: amount, dc: concentrationDC(amount, edition), con: conSave(d) });
    },
    regainSlot: async (level) => {
      const was = live.s?.[String(level)] ?? 0;
      if (!was) return;
      await patch({ [`s/${level}`]: was - 1 || null }, 'Spell slot');
      await tableChat.event({ t: 'use', who, what: `a ${ordinal(level)}-level slot`, left: slotsLeft(d, live, level) + 1, of: d.slots[level - 1] ?? 0, back: 1, undo: { key, path: `s/${level}`, was } });
    },
    shortRest: async () => {
      const next = shortRest(d, live);
      await setPlay(cid, key, owner, name, next).catch(fail('Short rest'));
      await tableChat.event({ t: 'rest', who, kind: 'short', hd: `${hitDiceLeft(d, next)} of ${d.hitDiceMax} hit dice left` });
    },
    longRest: async (opts) => {
      const next = longRest(d, live, edition);
      await setPlay(cid, key, owner, name, next).catch(fail('Long rest'));
      // Hit points back to full, temporary HP and death saves cleared.
      const hp = readHp(entity.attributes, entity.dndStats?.hitPoints);
      if (hp.max) await updateCharacterHp(entity.id, { ...hpToAttributes({ current: hp.max, temp: 0, max: hp.max }), deathSaves: writeDeathSaves({ successes: 0, failures: 0 }) }).catch(fail('Long rest'));
      if (!opts?.quiet) await tableChat.event({ t: 'rest', who, kind: 'long', ...(opts?.party ? { party: 1 as const } : {}), hp: hp.max ? `HP ${hp.max}/${hp.max}` : undefined, hd: `${hitDiceLeft(d, next)} of ${d.hitDiceMax} hit dice` });
    },
    saveDef: (next) => setPlayDef(entity.id, next as Record<string, unknown>).catch(fail('Tracker setup')),
  };
  return api;
}

/**
 * The DM rests the whole party at once (every player's character). Short: short-rest things come
 * back for everyone (hit dice are each player's own choice, on their tracker). Long: everything.
 */
export async function partyRest(cid: string, dmId: string, characters: Entity[], edition: Edition, kind: 'short' | 'long', play: Record<string, PlayLive>) {
  for (const e of characters) {
    const d = derive({ classLevel: e.attributes?.classLevel, stats: e.dndStats ?? undefined, def: readDef(e), edition });
    const key = playKey(e.id);
    const live = play[key] ?? {};
    const owner = e.playerId || dmId;
    if (kind === 'short') await setPlay(cid, key, owner, e.name, shortRest(d, live));
    else {
      await setPlay(cid, key, owner, e.name, longRest(d, live, edition));
      const hp = readHp(e.attributes, e.dndStats?.hitPoints);
      if (hp.max) await updateCharacterHp(e.id, { ...hpToAttributes({ current: hp.max, temp: 0, max: hp.max }), deathSaves: writeDeathSaves({ successes: 0, failures: 0 }) });
    }
  }
  await tableChat.event({ t: 'rest', who: 'The party', kind, party: 1, ...(kind === 'short' ? { hd: 'spend hit dice with Short rest on your tracker' } : { hp: 'HP, slots and resources back' }) });
}
