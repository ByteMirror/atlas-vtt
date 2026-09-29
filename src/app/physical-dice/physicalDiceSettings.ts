import type { PhysicalDiceSettings } from '../types/collectionSettingsTypes';
import { createDiceSettings, type DiceSettings } from './engine/diceSettings';

const ENGINE_DEFAULTS = createDiceSettings();

/** The physical dice of a collection that never changed them. */
export const DEFAULT_PHYSICAL_DICE: PhysicalDiceSettings = {
  diceSize: ENGINE_DEFAULTS.diceSize,
  enableShadows: ENGINE_DEFAULTS.enableShadows,
  ambientLightIntensity: ENGINE_DEFAULTS.ambientLightIntensity,
  directionalLightIntensity: ENGINE_DEFAULTS.directionalLightIntensity,
  motionThreshold: ENGINE_DEFAULTS.motionThreshold,
  faceDetectionTolerance: ENGINE_DEFAULTS.faceDetectionTolerance,
  highlightCompletedDice: ENGINE_DEFAULTS.highlightCompletedDice,
  completedDiceHighlightColor: ENGINE_DEFAULTS.completedDiceHighlightColor,
};

/** A collection's stored physical dice settings, with the defaults filled in. */
export function resolvePhysicalDice(stored: Partial<PhysicalDiceSettings> | undefined): PhysicalDiceSettings {
  return { ...DEFAULT_PHYSICAL_DICE, ...stored };
}

/** The engine's settings for a collection's physical dice; each call returns a fresh copy. */
export function engineSettingsFor(dice: PhysicalDiceSettings): DiceSettings {
  const { pack: _pack, ...values } = dice;
  return { ...createDiceSettings(), ...values };
}
