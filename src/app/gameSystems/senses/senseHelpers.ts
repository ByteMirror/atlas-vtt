import type { SenseDefinition, SenseGrant, SenseSight } from '../../types/senseTypes';

/** A sense as a built-in list defines it; the id is derived from the preset and the sense's key. */
export type BuiltInSense = Omit<SenseDefinition, 'id'>;

type Behaviour = Omit<SenseDefinition, 'id' | 'name' | 'description' | 'range' | 'grants'>;

/** Perceiving in full whatever the light: darkness, magical darkness and dim light all as bright light. */
export const IN_ANY_LIGHT: SenseSight = { bright: 'normal', dim: 'as-bright', dark: 'as-bright', magicalDark: 'as-bright' };

/** What the eyes see without help: bright and dim light as they are, nothing in darkness. */
export const BY_LIGHT: SenseSight = { bright: 'normal', dim: 'normal', dark: 'none', magicalDark: 'none' };

/** A way of seeing: walls stop it, a blinded token loses it, and it shows the map with the tokens on it. */
export function seeing(sees: SenseSight, look: SenseDefinition['look'] = 'colour'): Behaviour {
  return { lineOfSight: true, sees: { ...sees }, look, reveals: 'all', precise: true, seesInvisible: false, worksWhileBlinded: false };
}

/**
 * A sense that feels, smells or hears creatures: through walls, in any light, invisible ones
 * too, and without showing the map. Imprecise unless the rules say otherwise.
 */
export function sensing(precise = false): Behaviour {
  return { lineOfSight: false, sees: { ...IN_ANY_LIGHT }, look: 'colour', reveals: 'creatures', precise, seesInvisible: true, worksWhileBlinded: true };
}

/**
 * A modifier: it perceives nothing itself and gives the token's eye senses `grants`. These are
 * the fixed values every such entry has, so nothing reads it as a sense of its own.
 */
export function granting(grants: SenseGrant): Behaviour & Pick<SenseDefinition, 'range' | 'grants'> {
  return {
    grants,
    lineOfSight: true,
    sees: { bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' },
    look: 'colour',
    reveals: 'creatures',
    precise: false,
    seesInvisible: false,
    worksWhileBlinded: false,
    range: 'unlimited',
  };
}

/**
 * Senses with ids made like condition ids: the preset's key, a hyphen, their own key
 * (`dnd5e-darkvision`). Never change a key: tokens, collections and presets record the ids.
 */
export function sensesOf(presetKey: string, senses: Readonly<Record<string, BuiltInSense>>): readonly SenseDefinition[] {
  return Object.entries(senses).map(([key, sense]) => ({ id: `${presetKey}-${key}`, ...sense }));
}
