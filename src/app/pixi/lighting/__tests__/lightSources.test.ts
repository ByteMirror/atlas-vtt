import { describe, expect, it } from 'vitest';
import { activeLights, bounceFrame, lightFrame } from '../lightSources';
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
    expect(frame.sourceRadius).toBeCloseTo(28);
    expect(frame.intensity).toBeCloseTo(0.9);
    expect(frame.color[0]).toBeCloseTo(1);
  });

  it('keeps dim at least as large as bright', () => {
    const frame = lightFrame({ key: 'k', x: 0, y: 0, emission: { ...torch, bright: 50, dim: 10 } }, scale);
    expect(frame.dim).toBeGreaterThanOrEqual(frame.bright);
  });
});

describe('bounceFrame', () => {
  const frame = lightFrame({ key: 'k', x: 10, y: 20, emission: torch }, scale);

  it('turns a light into a faint, wide area light around the same point', () => {
    const bounce = bounceFrame(frame);
    expect(bounce.x).toBe(frame.x);
    expect(bounce.y).toBe(frame.y);
    expect(bounce.color).toEqual(frame.color);
    expect(bounce.bright).toBe(0);
    expect(bounce.dim).toBeGreaterThan(frame.dim);
    expect(bounce.sourceRadius).toBeGreaterThan(frame.sourceRadius * 5);
    expect(bounce.intensity).toBeLessThan(frame.intensity * 0.35);
    expect(bounce.intensity).toBeGreaterThan(0);
  });

  it('keeps the area light clear of the nearest wall', () => {
    expect(bounceFrame(frame, 40).sourceRadius).toBeLessThanOrEqual(40 * 0.8);
    expect(bounceFrame(frame, 1e6).sourceRadius).toBeCloseTo(bounceFrame(frame).sourceRadius);
  });
});
