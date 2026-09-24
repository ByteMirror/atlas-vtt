import type { Character } from '../../types';
import type { TokenUpdates } from '../../storeFactory';
import type { ResourceValue } from '../tokenValueEditor';

/** Maximum shown for hit points stored as a bare number. */
const DEFAULT_MAX_HP = 100;
/** Maximum shown for a secondary resource stored without one. */
const DEFAULT_MAX_STRESS = 10;

type ResourceToken = Partial<Pick<Character, 'hp' | 'stress' | 'maxStress'>>;

export type ResourceKind = 'hp' | 'stress';

export interface ResourceBar {
  kind: ResourceKind;
  value: ResourceValue;
}

/** The token's hit points as its bar shows them, whichever form they are stored in. */
export function tokenHp(token: ResourceToken): ResourceValue | null {
  if (token.hp == null) return null;
  return typeof token.hp === 'number' ? { current: token.hp, max: DEFAULT_MAX_HP } : token.hp;
}

/** The token's secondary resource as its bar shows it, whichever form it is stored in. */
export function tokenStress(token: ResourceToken): ResourceValue | null {
  if (token.stress == null) return null;
  if (typeof token.stress === 'object') return token.stress;
  return { current: token.stress, max: token.maxStress || DEFAULT_MAX_STRESS };
}

/**
 * The resource bars a token shows, top to bottom. The bars and their controls (the
 * click-to-edit overlays and +/- buttons) both lay out from this list, so every bar
 * drawn under a token can be edited and each overlay sits on its own bar.
 */
export function visibleResourceBars(
  token: ResourceToken,
  settings: { showHPBars: boolean; showStressBars: boolean },
): ResourceBar[] {
  const bars: ResourceBar[] = [];
  const hp = settings.showHPBars ? tokenHp(token) : null;
  if (hp) bars.push({ kind: 'hp', value: hp });
  const stress = settings.showStressBars ? tokenStress(token) : null;
  if (stress) bars.push({ kind: 'stress', value: stress });
  return bars;
}

/**
 * Store update that sets a bar from `shown` to `next`. Hit points are stored as
 * `{ current, max }`; a secondary resource keeps its object form, or else is stored as
 * a number with its maximum beside it. A new maximum marks the value as overridden,
 * so statblock edits leave it alone.
 */
export function resourceUpdates(token: ResourceToken, kind: ResourceKind, shown: ResourceValue, next: ResourceValue): TokenUpdates {
  const maxChanged = next.max !== shown.max;
  if (kind === 'hp') {
    return { hp: { current: next.current, max: next.max }, ...(maxChanged && { maxHpOverridden: true }) };
  }
  const stored = typeof token.stress === 'object'
    ? { stress: { current: next.current, max: next.max } }
    : { stress: next.current, maxStress: next.max };
  return { ...stored, ...(maxChanged && { maxStressOverridden: true }) };
}
