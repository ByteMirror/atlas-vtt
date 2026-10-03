/**
 * Choosing among a collection's light presets: the light a preset gives, the preset a light
 * came from, the one a tool places, and which presets a row of chips has room for.
 */

import { toGameUnits, type GameUnit } from '../grid/statedDistance';
import type { LightPresetDefinition } from '../types/lightPresetTypes';
import type { LightEmission, LightKind } from '../types/lightingTypes';
import { LIGHT_KINDS, lightKindOf, sameEmission } from './lightPresets';

/**
 * `presets` as a map offers them: their distances in what the map's collection measures in
 * (`unit`), converted from the unit each preset is written in as rulebooks convert (a 5e torch
 * is 20 and 40 feet, 6 and 12 metres, 4 and 8 squares), and stopped at `maxRange`, the farthest
 * a light may reach on the map. Everything that offers or applies a preset reads this list, so
 * what a preset shows and what it gives never differ.
 */
export function lightPresetsOnMap(presets: readonly LightPresetDefinition[], unit: GameUnit, maxRange: number): LightPresetDefinition[] {
  return presets.map(({ unit: writtenIn, ...preset }) => {
    const dim = Math.min(maxRange, toGameUnits({ value: preset.dim, unit: writtenIn ?? null }, unit));
    const bright = Math.min(dim, toGameUnits({ value: preset.bright, unit: writtenIn ?? null }, unit));
    return { ...preset, bright, dim };
  });
}

/** The light a preset of the map gives (`lightPresetsOnMap`), with its kind and the preset recorded on it. */
export function emissionOf(preset: LightPresetDefinition): LightEmission {
  return {
    bright: preset.bright,
    dim: preset.dim,
    color: preset.color,
    intensity: preset.intensity ?? 1,
    animation: preset.animation,
    ...(preset.sourceRadius !== undefined && { sourceRadius: preset.sourceRadius }),
    kind: preset.kind,
    preset: preset.id,
    ...(preset.darkness && { darkness: true }),
    ...(preset.priority !== undefined && preset.priority !== 0 && { priority: preset.priority }),
    ...(preset.angle !== undefined && { angle: preset.angle }),
  };
}

/** The light as it is, made a custom one: the plain marker, and no preset. */
export function asCustomLight(emission: LightEmission): LightEmission {
  const { preset: _preset, ...rest } = emission;
  return { ...rest, kind: 'custom' };
}

function knownKind(kind: LightKind | undefined): kind is LightKind {
  return kind !== undefined && LIGHT_KINDS.includes(kind);
}

/**
 * The preset of `presets` a light came from, or null for a custom light:
 * - the one it records, while that still has the light's kind (editing a light's values keeps both);
 * - else, unless the GM made it a custom light, the one it equals, of its kind where it has one;
 * - else the first of its kind, which reads lights placed before presets and lights of another
 *   game system.
 */
export function lightPresetOf(emission: LightEmission, presets: readonly LightPresetDefinition[]): LightPresetDefinition | null {
  const recorded = presets.find((preset) => preset.id === emission.preset);
  if (recorded && (emission.kind === undefined || emission.kind === recorded.kind)) return recorded;
  if (emission.kind === 'custom') return null;
  // A darkness is read as a darkness preset only, a light as a light's.
  const alike = presets.filter((preset) => !!preset.darkness === !!emission.darkness);
  const ofKind = knownKind(emission.kind) ? alike.filter((preset) => preset.kind === emission.kind) : alike;
  const equal = ofKind.find((preset) => sameEmission(emissionOf(preset), emission));
  if (equal) return equal;
  const kind = lightKindOf(emission);
  return kind === 'custom' ? null : alike.find((preset) => preset.kind === kind) ?? null;
}

/** The light a tool places until another is chosen: the collection's torch, else its first light. */
export function defaultLightPreset(presets: readonly LightPresetDefinition[]): LightPresetDefinition {
  const preset = presets.find((candidate) => candidate.kind === 'torch') ?? presets[0];
  if (!preset) throw new Error('A collection always offers a light preset');
  return preset;
}

/** The preset with `id` while the collection offers it, else its default light. */
export function chosenLightPreset(presets: readonly LightPresetDefinition[], id: string | null): LightPresetDefinition {
  return presets.find((preset) => preset.id === id) ?? defaultLightPreset(presets);
}

/** How many presets a row of chips shows beside its last cell (Custom, or More). */
const MAX_CHIPS = 5;

/**
 * The presets a row of chips shows and the ones it keeps under "More". Up to five fit as
 * chips. Of more, the first of each kind is a chip, so no two chips share a glyph (the list's
 * order says which lights are the common ones), then the next in the list until five are
 * shown; the chips keep the list's order.
 */
export function lightPresetChips(presets: readonly LightPresetDefinition[]): { chips: readonly LightPresetDefinition[]; more: readonly LightPresetDefinition[] } {
  if (presets.length <= MAX_CHIPS) return { chips: presets, more: [] };
  const firstOfKind = presets.filter((preset, index) => presets.findIndex((other) => other.kind === preset.kind) === index);
  const picked = new Set(firstOfKind.slice(0, MAX_CHIPS));
  for (const preset of presets) {
    if (picked.size >= MAX_CHIPS) break;
    picked.add(preset);
  }
  return { chips: presets.filter((preset) => picked.has(preset)), more: presets.filter((preset) => !picked.has(preset)) };
}
