import { describe, expect, it } from 'vitest';
import { activeLights, engineLight } from '../lightSources';
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

describe('engineLight', () => {
  it('converts game units, keeps a minimum flame and tints the colour halfway to white in linear light', () => {
    const light = engineLight({ key: 'k', x: 10, y: 20, emission: { ...torch, color: '#ff0000', sourceRadius: 0.1 } }, scale);
    expect(light).toMatchObject({ key: 'k', x: 10, y: 20, bright: 280, dim: 560, animation: torch.animation });
    expect(light.flame).toBeCloseTo(560 * 0.12, 6);
    expect(light.color[0]).toBe(1);
    expect(light.color[1]).toBeCloseTo(((0.5 + 0.055) / 1.055) ** 2.4, 6);
  });
});
