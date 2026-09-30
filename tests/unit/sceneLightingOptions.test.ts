import { describe, expect, it } from 'vitest';
import { clampLitThreshold, exploredMemoryOn, litThresholdOf, sceneLook, tokenVisionOn } from '../../src/app/lighting/sceneLightingOptions';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';

describe('scene lighting options', () => {
  it('uses token vision and explored memory unless the scene switches them off', () => {
    expect(tokenVisionOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(tokenVisionOn({ tokenVision: false })).toBe(false);
    expect(exploredMemoryOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(exploredMemoryOn({ exploredMemory: false })).toBe(false);
  });

  it('counts a scene as lit from 25 % ambient light unless it sets its own threshold', () => {
    expect(litThresholdOf(DEFAULT_SCENE_LIGHTING)).toBe(0.25);
    expect(litThresholdOf({ litThreshold: 0.6 })).toBe(0.6);
    expect(litThresholdOf({ litThreshold: 7 })).toBe(1);
  });

  it('clamps thresholds to 0..1 and replaces non-numbers with the default', () => {
    expect(clampLitThreshold(-1)).toBe(0);
    expect(clampLitThreshold(0.4)).toBe(0.4);
    expect(clampLitThreshold(2)).toBe(1);
    expect(clampLitThreshold(Number.NaN)).toBe(0.25);
  });

  it('passes the composite only the options it draws, and only those that are set', () => {
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, tokenVision: false, litThreshold: 0.5 })).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient });
    expect(sceneLook({ enabled: true, ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' }))
      .toEqual({ ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' });
  });
});
