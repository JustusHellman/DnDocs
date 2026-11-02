import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { applyPending, setPending, type Aim, type PendingHit } from '../../lib/battle/aimStore';
import { checkRange, tokenGapFeet, weaponRange, type Range } from '../../lib/battle/targeting';
import { patchToken } from '../../lib/battle/sceneService';
import { attackNumbers, makeAttack, setMapAttack, type AttackTarget } from '../../lib/play/attacks';
import { autoUnhideOf } from '../../lib/play/rules';
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import type { Entity, Scene, Token } from '../../types';
import type { PushUndo } from './useUndoStack';

export type MapTarget = AttackTarget & { id: string; feet: number };

/**
 * Attacking on the battle map, the same from everywhere (the turn helper, the character page, the
 * spellbook panel, `/attack`): at the target picked on purpose, asking first when it's out of reach
 * (and offering disadvantage at long range), ending Hidden when the table plays it that way (said,
 * with an Undo), and offering the damage after — applied only when someone presses Apply.
 */
export function useMapAttacks(o: { scene: Scene; tokens: Token[]; aim: Aim | null; asDM: boolean; entityOf: (t: Token) => Entity | undefined; pushUndo: PushUndo }) {
  const { scene, tokens, aim, asDM, entityOf, pushUndo } = o;
  const { currentCampaign } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  /** The attacker's target (its AC only when the person rolling may know it: the DM, or a character's). */
  const targetOf = (attacker: Token | null | undefined): MapTarget | null => {
    if (!attacker || !aim || aim.by !== attacker.id) return null;
    const t = tokens.find((x) => x.id === aim.target);
    if (!t) return null;
    const e = entityOf(t);
    const ac = asDM || e?.type === 'character' ? parseInt(String(e?.dndStats?.armorClass ?? ''), 10) : NaN;
    return { id: t.id, name: t.name, ac: Number.isFinite(ac) ? ac : null, feet: tokenGapFeet(attacker, t, scene.grid) };
  };

  /** Before an attack at the target: does it reach? No target: nothing to check. */
  const check = async (attacker: Token, name: string, range: Range): Promise<{ go: boolean; dis?: boolean }> => {
    const target = targetOf(attacker);
    if (!target) return { go: true };
    const c = checkRange(target.feet, range);
    if (c.ok && !c.long) return { go: true };
    if (c.ok)
      return (await confirm({
        title: 'Long range',
        message: `${target.name} is ${target.feet} ft away: beyond ${name}’s normal range (${range.normal} ft), so the attack has disadvantage.`,
        confirmLabel: 'Roll with disadvantage',
      }))
        ? { go: true, dis: true }
        : { go: false };
    return (await confirm({
      title: 'Out of reach?',
      message: `${target.name} is ${target.feet} ft away and ${name} reaches ${c.max} ft. Attack anyway (moved closer, or the DM allows it)?`,
      confirmLabel: 'Attack anyway',
    }))
      ? { go: true }
      : { go: false };
  };

  /** Attacking gives a hidden creature away (when the table plays it that way): said, with an Undo. */
  const unhide = async (attacker: Token) => {
    if (!autoUnhideOf(currentCampaign) || !attacker.conditions.includes('Hidden')) return;
    const timer = attacker.timers?.Hidden ?? null;
    await patchToken(scene.id, attacker.id, { conditions: arrayRemove('Hidden'), 'timers.Hidden': deleteField() }).catch(() => undefined);
    pushUndo(`${attacker.name} is no longer Hidden (attacked)`, () => patchToken(scene.id, attacker.id, { conditions: arrayUnion('Hidden'), 'timers.Hidden': timer ?? deleteField() }), true);
  };

  /**
   * After an attack at the target: its damage offered (in the turn list; from elsewhere, also on
   * screen with "Apply damage…").
   */
  const offer = (attacker: Token, title: string, toHit: number, natural: number | undefined, total: number | null, dmg: string | undefined, ty: string | undefined, from: 'turn' | 'elsewhere') => {
    const target = targetOf(attacker);
    if (!target) return;
    const verdict = natural === 20 ? 'crit' : natural === 1 ? 'miss' : target.ac === null ? null : toHit >= target.ac ? 'hit' : 'miss';
    const p: PendingHit = { by: attacker.id, byName: attacker.name, title, verdict, total, dmg, ty, target: { id: target.id, name: target.name } };
    setPending(p);
    if (from === 'elsewhere' && verdict !== 'miss')
      toast.show(`${title} ${verdict === 'crit' ? 'crits' : verdict === 'hit' ? 'hits' : 'at'} ${target.name}${total !== null ? `: ${total}${ty ? ` ${ty}` : ''}` : ''}`, {
        action: { label: 'Apply damage…', onClick: () => applyPending(p) },
        duration: 10000,
      });
  };

  // A character's attack from anywhere goes through here while the map is open.
  const self = useRef({ targetOf, check, unhide, offer });
  self.current = { targetOf, check, unhide, offer };
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  useEffect(() => {
    setMapAttack(async (p, a, opts) => {
      // Its token on this map (the one aimed with, if there are several).
      const mine = tokensRef.current.filter((t) => t.entityId === p.entity.id);
      const attacker = mine.find((t) => self.current.targetOf(t)) ?? mine[0];
      if (!attacker) return null;
      const ok = await self.current.check(attacker, a.name, weaponRange(a));
      if (!ok.go) return { warn: null };
      await self.current.unhide(attacker);
      const target = self.current.targetOf(attacker);
      const { warn, roll } = await makeAttack(p, a, { adv: opts.adv, dis: opts.dis || ok.dis, vs: target });
      if (roll) self.current.offer(attacker, a.name, roll.total, roll.natural, roll.damage, attackNumbers(a, p.d).dmg, a.ty, opts.from);
      return { warn };
    });
    return () => setMapAttack(null);
  }, []);
  // A new target (or none) or a new turn: the last offer goes.
  useEffect(() => setPending(null), [aim?.by, aim?.target, scene.combat?.turn]);

  return { targetOf, check, unhide, offer };
}
export type MapAttacks = ReturnType<typeof useMapAttacks>;
