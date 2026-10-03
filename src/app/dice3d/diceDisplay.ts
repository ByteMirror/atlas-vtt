/** How rolls are shown: as a result card, or thrown as dice at normal or double speed. */
export type DiceDisplay = 'card' | 'fast' | 'full';

export const DICE_DISPLAY_OPTIONS: readonly { value: DiceDisplay; label: string }[] = [
  { value: 'card', label: 'Result card' },
  { value: 'fast', label: 'Fast dice' },
  { value: 'full', label: 'Dice' },
];

export const DICE_DISPLAY_HINTS: Record<DiceDisplay, string> = {
  card: 'Every roll shows its result on a card, without dice.',
  fast: 'Dice are thrown at double speed and bounce off the walls at most three times. The result stays on screen as long as with normal dice.',
  full: 'Dice are thrown, bounce off the panel and land on the result.',
};

export function isDiceDisplay(value: unknown): value is DiceDisplay {
  return DICE_DISPLAY_OPTIONS.some((option) => option.value === value);
}

/** How a throw plays out. */
export interface ThrowStyle {
  /** How much faster than real time the throw plays. */
  speed: number;
  /** Most wall hits a die may make on its way; a quick throw rattles less. */
  maxWallHits: number;
}

const NORMAL_THROW: ThrowStyle = { speed: 1, maxWallHits: Infinity };
const FAST_THROW: ThrowStyle = { speed: 2, maxWallHits: 3 };

export function throwStyle(display: DiceDisplay): ThrowStyle {
  return display === 'fast' ? FAST_THROW : NORMAL_THROW;
}
