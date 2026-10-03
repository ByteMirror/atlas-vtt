import { describe, expect, it } from 'vitest';
import { LIGHT_SCHEDULES, ambientGate, isLightOn, scheduleOf, sleeps } from '../lightActivity';

describe('a light that follows the ambient light', () => {
  it('is on at or below its level, and off while the scene is brighter', () => {
    const lamp = { activeBelowAmbient: 0.5 };
    expect(isLightOn(lamp, 1)).toBe(false);
    expect(isLightOn(lamp, 0.51)).toBe(false);
    // At dusk itself a lamp set to dusk burns.
    expect(isLightOn(lamp, 0.5)).toBe(true);
    expect(isLightOn(lamp, 0)).toBe(true);
    expect(sleeps(lamp, 1)).toBe(true);
    expect(sleeps(lamp, 0.5)).toBe(false);
  });

  it('is always on without a level, and never while it is switched off', () => {
    expect(isLightOn({}, 1)).toBe(true);
    expect(sleeps({}, 1)).toBe(false);
    expect(isLightOn({ hidden: true }, 0)).toBe(false);
    expect(isLightOn({ hidden: true, activeBelowAmbient: 0.5 }, 0)).toBe(false);
    // Switched off is not asleep: the GM put it out.
    expect(sleeps({ hidden: true, activeBelowAmbient: 0.5 }, 1)).toBe(false);
  });

  it('reads a level of full daylight, or one that is no level, as always on', () => {
    expect(ambientGate({ activeBelowAmbient: 1 })).toBeUndefined();
    expect(ambientGate({ activeBelowAmbient: -0.2 })).toBe(0);
    expect(ambientGate({ activeBelowAmbient: Number.NaN })).toBeUndefined();
    expect(ambientGate({ activeBelowAmbient: 'dusk' as never })).toBeUndefined();
    expect(isLightOn({ activeBelowAmbient: 1 }, 1)).toBe(true);
  });

  it('offers the times of day a lamp comes on at, and names any other level', () => {
    expect(LIGHT_SCHEDULES.map(({ label, level }) => [label, level])).toEqual([['Always', undefined], ['From dusk', 0.5], ['At night', 0.15]]);
    expect(scheduleOf({})).toEqual({ value: 'always', label: 'Always' });
    expect(scheduleOf({ activeBelowAmbient: 0.5 })).toEqual({ value: 'dusk', label: 'From dusk' });
    expect(scheduleOf({ activeBelowAmbient: 0.15 })).toEqual({ value: 'night', label: 'At night' });
    expect(scheduleOf({ activeBelowAmbient: 0.3 })).toEqual({ value: 'custom', label: 'Below 30 % light' });
  });
});
