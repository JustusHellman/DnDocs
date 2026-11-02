/**
 * Damage to several tokens at once (an area spell): characters' hit points (shared with their
 * sheets), monsters' private ones (the DM's), with what goes with it — falling to 0 (Unconscious,
 * concentration ends), the concentration save, massive damage. Returns an undo for all of it.
 */
import { arrayRemove, arrayUnion } from 'firebase/firestore';
import type { Entity, Scene, Token } from '../../types';
import { applyHp, deathSavesAfter, hpToAttributes, readDeathSaves, readHp } from '../hitPoints';
import { updateCharacterHp } from '../entityService';
import { patchToken, setTokenHp } from './sceneService';
import { tableChat } from '../chat/bus';
import { patchPlay, setDmConc, type LiveSnapshot } from '../play/live';
import { concentrationDC, derive, playKey, type Edition } from '../play/model';
import { conSave, readDef } from '../play/usePlayer';

export interface DamageItem {
  token: Token;
  entity?: Entity;
  amount: number;
}

export async function damageTokens(o: {
  scene: Scene;
  items: DamageItem[];
  secretHp: Record<string, { cur: number; max: number }>;
  edition: Edition;
  massiveRule: boolean;
  table: Pick<LiveSnapshot, 'play' | 'dm'>;
  dmId: string;
}): Promise<{ undo: () => Promise<unknown>; notes: string[] }> {
  const undos: (() => Promise<unknown>)[] = [];
  const notes: string[] = [];
  const cid = o.scene.campaignId;
  for (const { token: t, entity: e, amount: n } of o.items) {
    if (n <= 0) continue;
    if (e?.type === 'character') {
      const hp = readHp(e.attributes, e.dndStats?.hitPoints);
      const next = applyHp(hp, 'damage', n);
      const saves = readDeathSaves(e.attributes);
      const { deathSaves, massive } = deathSavesAfter(hp, next, 'damage', n, saves, o.massiveRule);
      const before = { currentHp: String(e.attributes?.currentHp ?? ''), tempHp: String(e.attributes?.tempHp ?? ''), deathSaves: String(e.attributes?.deathSaves ?? '') };
      await updateCharacterHp(e.id, { ...hpToAttributes(next), deathSaves });
      undos.push(() => updateCharacterHp(e.id, before));
      if (massive) notes.push(`${t.name} dies outright (massive damage).`);
      const key = playKey(e.id);
      const live = o.table.play[key];
      const down = (hp.current ?? 1) > 0 && (next.current ?? 1) <= 0;
      if (down) {
        if (!t.conditions.includes('Unconscious')) {
          await patchToken(o.scene.id, t.id, { conditions: arrayUnion('Unconscious') });
          undos.push(() => patchToken(o.scene.id, t.id, { conditions: arrayRemove('Unconscious') }));
        }
        if (live?.conc) {
          await patchPlay(cid, key, live.uid ?? e.playerId ?? o.dmId, live.name ?? e.name, { conc: null, cs: null });
          notes.push(`${t.name} drops to 0 HP and loses concentration.`);
        }
      } else if (live?.conc) {
        // The concentration save goes to the chat for the player, as with any damage.
        const d = derive({ classLevel: e.attributes?.classLevel, stats: e.dndStats ?? undefined, def: readDef(e), edition: o.edition });
        await tableChat.event({ t: 'conc', who: e.name.split(' ')[0], key, owner: live.uid ?? e.playerId ?? o.dmId, dmg: n, dc: concentrationDC(n, o.edition), con: conSave(d) });
      }
      continue;
    }
    const cur = o.secretHp[t.id];
    if (!cur) {
      notes.push(`${t.name}: no hit points set (type them on its card and press Max).`);
      continue;
    }
    const next = Math.max(0, cur.cur - n);
    await setTokenHp(o.scene.id, cid, t.id, { cur: next, max: cur.max }, t.health);
    undos.push(() => setTokenHp(o.scene.id, cid, t.id, cur, null));
    const key = playKey(null, t.id);
    const conc = !!o.table.dm[key]?.conc || t.conditions.includes('Concentrating');
    if (conc && next <= 0) {
      await setDmConc(cid, key, false).catch(() => undefined);
      if (t.conditions.includes('Concentrating')) await patchToken(o.scene.id, t.id, { conditions: arrayRemove('Concentrating') });
      notes.push(`${t.name} drops and loses concentration.`);
    } else if (conc) notes.push(`${t.name} is concentrating: Constitution save DC ${concentrationDC(n, o.edition)}.`);
  }
  return { undo: () => Promise.all(undos.map((u) => u())), notes };
}

/**
 * Healing several tokens at once (or one): characters' hit points (back up from 0: no longer
 * unconscious, death saves cleared), monsters' private ones (up to their maximum). Undo included.
 */
export async function healTokens(o: { scene: Scene; items: DamageItem[]; secretHp: Record<string, { cur: number; max: number }> }): Promise<{ undo: () => Promise<unknown>; notes: string[] }> {
  const undos: (() => Promise<unknown>)[] = [];
  const notes: string[] = [];
  for (const { token: t, entity: e, amount: n } of o.items) {
    if (n <= 0) continue;
    if (e?.type === 'character') {
      const { undo, wasDown } = await healCharacter(e, n);
      undos.push(undo);
      if (wasDown && t.conditions.includes('Unconscious')) {
        await patchToken(o.scene.id, t.id, { conditions: arrayRemove('Unconscious') });
        undos.push(() => patchToken(o.scene.id, t.id, { conditions: arrayUnion('Unconscious') }));
      }
      continue;
    }
    const cur = o.secretHp[t.id];
    if (!cur) {
      notes.push(`${t.name}: no hit points set.`);
      continue;
    }
    await setTokenHp(o.scene.id, o.scene.campaignId, t.id, { cur: Math.min(cur.max, cur.cur + n), max: cur.max }, t.health);
    undos.push(() => setTokenHp(o.scene.id, o.scene.campaignId, t.id, cur, null));
  }
  return { undo: () => Promise.all(undos.map((u) => u())), notes };
}

/** A character healed by `n` (from the chat, or with no map open). */
export async function healCharacter(e: Entity, n: number): Promise<{ undo: () => Promise<unknown>; wasDown: boolean; before: number | null; after: number | null }> {
  const hp = readHp(e.attributes, e.dndStats?.hitPoints);
  const next = applyHp(hp, 'heal', n);
  const before = { currentHp: String(e.attributes?.currentHp ?? ''), tempHp: String(e.attributes?.tempHp ?? ''), deathSaves: String(e.attributes?.deathSaves ?? '') };
  const wasDown = (hp.current ?? 1) <= 0;
  await updateCharacterHp(e.id, { ...hpToAttributes(next), ...(wasDown ? { deathSaves: '' } : {}) });
  return { undo: () => updateCharacterHp(e.id, before), wasDown, before: hp.current, after: next.current };
}

/** What a token's hit points are now, as far as this screen knows: a number, or null. */
export function hpNow(t: Token, e: Entity | undefined, secretHp: Record<string, { cur: number; max: number }>): { cur: number; max: number | null } | null {
  if (e?.type === 'character') {
    const hp = readHp(e.attributes, e.dndStats?.hitPoints);
    return hp.current === null ? null : { cur: hp.current, max: hp.max };
  }
  const s = secretHp[t.id];
  return s ? { cur: s.cur, max: s.max } : null;
}

/** A creature's save bonus: from "Saving Throws Dex +5" in its stat block, else the ability modifier. */
export function saveBonus(ability: string, entity: Entity | undefined, statText: string | null | undefined): number {
  const ab = ability.slice(0, 3).toLowerCase();
  const line = /Saving Throws?\**\s*([^\n]+)/i.exec(statText ?? '')?.[1] ?? '';
  const listed = new RegExp(`\\b${ab}\\w*\\s*([+-]\\d+)`, 'i').exec(line);
  if (listed) return Number(listed[1]);
  const score = Number((entity?.dndStats as unknown as Record<string, number> | null | undefined)?.[ab]);
  return Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
}
