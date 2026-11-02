/** The table's rules from the campaign settings, in one place (rather than worked out in every component). */
import type { Campaign } from '../../types';
import type { Edition } from './model';
import type { SpellsPerTurn } from './turn';
import type { CritRule } from '../dice';

/** Which free rules the campaign follows (2014 unless the DM chose 2024). */
export const editionOf = (c: Pick<Campaign, 'houseRules'> | null | undefined): Edition => (c?.houseRules?.edition === '2024' ? '2024' : '2014');

/** The massive-damage rule (on unless switched off). */
export const massiveDamageOf = (c: Pick<Campaign, 'houseRules'> | null | undefined) => c?.houseRules?.massiveDamage !== false;

/** The spells-a-turn warnings the table plays with. */
export const spellsPerTurnOf = (c: Pick<Campaign, 'houseRules'> | null | undefined): SpellsPerTurn => c?.houseRules?.spellsPerTurn ?? 'rules';

/** How critical hits roll their damage (the rules' "dice twice" unless the DM picked another). */
export const critRuleOf = (c: Pick<Campaign, 'houseRules'> | null | undefined): CritRule => c?.houseRules?.crits ?? 'double-dice';

/** The DM's screen rolls monsters' recharges (on unless switched off). */
export const autoRechargeOf = (c: Pick<Campaign, 'houseRules'> | null | undefined) => c?.houseRules?.autoRecharge !== false;

/** Attacking ends Hidden (on unless switched off). */
export const autoUnhideOf = (c: Pick<Campaign, 'houseRules'> | null | undefined) => c?.houseRules?.autoUnhide !== false;

export const CRIT_LABEL: Record<CritRule, string> = { 'double-dice': 'critical!', 'max-plus-roll': 'critical: max + roll', 'double-total': 'critical: doubled' };

// The open campaign's rules for code that rolls without a campaign at hand (an attack from the
// chat, say). Kept up to date by the app shell.
let current: Pick<Campaign, 'houseRules'> | null = null;
export const setCurrentRules = (c: Pick<Campaign, 'houseRules'> | null) => {
  current = c;
};
/** The critical-hit rule of the campaign that's open. */
export const critRule = () => critRuleOf(current);
