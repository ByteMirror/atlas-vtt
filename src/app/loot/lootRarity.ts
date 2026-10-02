import { t } from '../i18n';
/**
 * The classic item-rarity ladder games colour loot by. An item's own rarity
 * names map onto it, so a Rarity property can use the words its system uses.
 */
export const RARITY_TONES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type RarityTone = typeof RARITY_TONES[number];

export const RARITY_LABELS: Record<RarityTone, string> = {
  common: t('loot.rarity.common'),
  uncommon: t('loot.rarity.uncommon'),
  rare: t('loot.rarity.rare'),
  epic: t('loot.rarity.epic'),
  legendary: t('loot.rarity.legendary'),
};

const TONES: ReadonlyArray<readonly [RegExp, RarityTone]> = [
  [/^(common|poor|mundane|junk)$/i, 'common'],
  [/^uncommon$/i, 'uncommon'],
  [/^rare$/i, 'rare'],
  [/^(epic|very rare)$/i, 'epic'],
  [/^(legendary|artifact|artefact|mythic|unique)$/i, 'legendary'],
];

/** The tone to colour an item by, or undefined for a rarity outside the ladder. */
export function rarityTone(rarity: string | undefined): RarityTone | undefined {
  const name = rarity?.replace(/[*_]/g, '').trim();
  if (!name) return undefined;
  return TONES.find(([pattern]) => pattern.test(name))?.[1];
}

export function isRarityTone(value: unknown): value is RarityTone {
  return RARITY_TONES.some((tone) => tone === value);
}
