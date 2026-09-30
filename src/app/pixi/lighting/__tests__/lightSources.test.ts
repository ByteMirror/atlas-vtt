import { describe, expect, it } from 'vitest';
import { activeLights, lightFrame } from '../lightSources';
import { LIGHT_PRESETS } from '../../../lighting/lightPresets';
import type { LightSource } from '../../../types/lightingTypes';
import type { TokenEntity } from '../../../types';

const torch = LIGHT_PRESETS.torch.emission;
const scale = { unitDistance: 5, cellSize: 70 };

describe('activeLights', () => {
  it('collects placed lights that are on and lights carried by tokens', () => {
    const lights: Record<string, LightSource> = {
      a: { id: 'a', kind: 'light', x: 1, y: 2, emission: torch },
      off: { id: 'off', kind: 'light', x: 0, y: 0, emission: torch, hidden: true },
    };
    const tokens: Record<string, TokenEntity> = {
      t: { id: 't', kind: 'token', imagePath: 't.png', x: 5, y: 6, light: torch },
      plain: { id: 'plain', kind: 'token', imagePath: 'p.png', x: 0, y: 0 },
    };
    expect(activeLights(lights, tokens)).toEqual([
      { key: 'light:a', x: 1, y: 2, emission: torch },
      { key: 'token:t', x: 5, y: 6, emission: torch },
    ]);
  });
});

describe('lightFrame', () => {
  it('converts game units to world pixels and applies the flicker', () => {
    const frame = lightFrame({ key: 'k', x: 10, y: 20, emission: torch }, scale, { intensity: 0.9, radiusScale: 1.1, jitterX: 1, jitterY: -1 });
    expect(frame.x).toBe(11);
    expect(frame.y).toBe(19);
    expect(frame.bright).toBeCloseTo(280 * 1.1);
    expect(frame.dim).toBeCloseTo(560 * 1.1);
    expect(frame.sourceRadius).toBeCloseTo(14);
    expect(frame.intensity).toBeCloseTo(0.9);
    expect(frame.color[0]).toBeCloseTo(1);
  });

  it('keeps dim at least as large as bright', () => {
    const frame = lightFrame({ key: 'k', x: 0, y: 0, emission: { ...torch, bright: 50, dim: 10 } }, scale);
    expect(frame.dim).toBeGreaterThanOrEqual(frame.bright);
  });
});
