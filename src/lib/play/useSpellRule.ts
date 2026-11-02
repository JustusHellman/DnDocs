import { useAuth } from '../../contexts/AuthContext';
import { isTurnOf, useCombatContext } from './turnStore';
import { spellRule } from './turn';
import type { PlayerApi } from './usePlayer';

/**
 * Why a spell can't be cast right now by the spells-per-turn rule (null: it can), for a
 * character whose turn it is in a fight. Only a warning: the Cast buttons keep working.
 */
export function useSpellRule(p: PlayerApi | null | undefined): (sp: { l: number; t: string }) => string | null {
  useCombatContext();
  const { currentCampaign } = useAuth();
  if (!p || !isTurnOf(p.key)) return () => null;
  const bits = p.live.sp ?? 0;
  const mode = currentCampaign?.houseRules?.spellsPerTurn ?? 'rules';
  return (sp) => spellRule(sp, bits, p.edition, mode);
}
