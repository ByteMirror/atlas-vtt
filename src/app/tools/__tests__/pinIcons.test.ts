import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PIN_ICON,
  LOCATION_PIN_ICON,
  PIN_ICON_PATHS,
  PIN_PALETTE,
  PIN_PLACE_GROUPS,
  getPinIconDefinition,
  isPlacePinIcon,
  resolvePinIcon,
  type PinIconId,
} from '../../types/pinIcons';

const paletteIcons = PIN_PALETTE.flatMap((slot) => (slot.kind === 'icon' ? [slot.icon.id] : []));
const placeIcons = PIN_PLACE_GROUPS.flatMap((group) => group.places.map((place) => place.id));

describe('pin icon catalogue', () => {
  it('offers every icon exactly once, either in the palette or among the places', () => {
    const offered = [...paletteIcons, ...placeIcons];
    expect(new Set(offered).size).toBe(offered.length);
    expect(offered.sort()).toEqual((Object.keys(PIN_ICON_PATHS) as PinIconId[]).sort());
  });

  it('defines a name and a colour for both themes for every icon', () => {
    for (const id of Object.keys(PIN_ICON_PATHS) as PinIconId[]) {
      const definition = getPinIconDefinition(id);
      expect(definition.name).not.toBe('');
      expect(definition.tone.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(definition.tone.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has one location slot and no empty place group', () => {
    expect(PIN_PALETTE.filter((slot) => slot.kind === 'places')).toHaveLength(1);
    for (const group of PIN_PLACE_GROUPS) expect(group.places.length).toBeGreaterThan(0);
  });

  it('counts the location marker and the places as place icons, and nothing else', () => {
    expect(isPlacePinIcon(LOCATION_PIN_ICON.id)).toBe(true);
    expect(isPlacePinIcon('forest')).toBe(true);
    expect(isPlacePinIcon('pin')).toBe(false);
    expect(isPlacePinIcon('number')).toBe(false);
  });
});

describe('resolvePinIcon', () => {
  it('keeps current icons and label sequences', () => {
    expect(resolvePinIcon('village')).toBe('village');
    expect(resolvePinIcon('number')).toBe('number');
    expect(resolvePinIcon('letter')).toBe('letter');
  });

  it('maps the Lucide ids of older pins to their pin icon', () => {
    expect(resolvePinIcon('map-pin')).toBe('location');
    expect(resolvePinIcon('alert-triangle')).toBe('trap');
    expect(resolvePinIcon('scroll')).toBe('note');
    expect(resolvePinIcon('eye')).toBe('secret');
  });

  it('falls back to the default pin for missing or unknown icons', () => {
    expect(resolvePinIcon(undefined)).toBe(DEFAULT_PIN_ICON);
    expect(resolvePinIcon('')).toBe(DEFAULT_PIN_ICON);
    expect(resolvePinIcon('from-a-newer-atlas')).toBe(DEFAULT_PIN_ICON);
  });
});
