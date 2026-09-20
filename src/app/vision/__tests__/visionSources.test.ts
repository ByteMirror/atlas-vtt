import { describe, it, expect } from 'vitest';
import { collectVisionSources } from '../visionSources';
import type { TokenEntity, Character, Token } from '../../types';
import type { LightSource, VisionSettings } from '../../types/wallTypes';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char1',
    kind: 'character',
    x: 100,
    y: 200,
    imagePath: 'test.png',
    name: 'Test',
    hp: 10,
    hasVision: true,
    ...overrides,
  };
}

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 'tok1',
    kind: 'token',
    x: 0,
    y: 0,
    imagePath: 'test.png',
    ...overrides,
  };
}

function makeLight(overrides: Partial<LightSource> = {}): LightSource {
  return {
    id: 'light1',
    kind: 'light',
    x: 50,
    y: 50,
    innerRadius: 420, // Already in world pixels (30ft at 70px/5ft grid)
    ...overrides,
  };
}

// Vision settings use game units (feet)
const defaultSettings: VisionSettings = {
  enabled: true,
  defaultInnerRadius: 30,    // 30 feet
  defaultOuterRadius: 60,    // 60 feet
};

// Grid: 70px per cell, 5ft per cell → 14px per foot
const GRID_SIZE = 70;
const UNIT_DISTANCE = 5;

describe('collectVisionSources', () => {
  it('returns empty when vision is disabled', () => {
    const tokens = { char1: makeCharacter() };
    const lights = {};
    const settings: VisionSettings = { enabled: false, defaultInnerRadius: 30 };

    expect(collectVisionSources(tokens, lights, settings, GRID_SIZE, UNIT_DISTANCE)).toEqual([]);
  });

  it('returns empty when settings are undefined', () => {
    const tokens = { char1: makeCharacter() };
    expect(collectVisionSources(tokens, {}, undefined, GRID_SIZE, UNIT_DISTANCE)).toEqual([]);
  });

  it('converts game-unit radii to world pixels for tokens', () => {
    const tokens = { char1: makeCharacter({ hasVision: true }) };
    const result = collectVisionSources(tokens, {}, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('char1');
    // 30ft → (30/5)*70 = 420px, 60ft → (60/5)*70 = 840px
    expect(result[0]!.innerRadius).toBe(420);
    expect(result[0]!.outerRadius).toBe(840);
  });

  it('excludes tokens without hasVision flag', () => {
    const tokens: Record<string, TokenEntity> = {
      tok1: makeToken({ hasVision: false }),
      tok2: makeToken({ id: 'tok2' }),
    };
    const result = collectVisionSources(tokens, {}, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result).toHaveLength(0);
  });

  it('simple tokens can have vision too', () => {
    const tokens: Record<string, TokenEntity> = {
      tok1: makeToken({ hasVision: true }),
    };
    const result = collectVisionSources(tokens, {}, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('tok1');
  });

  it('applies per-token vision overrides (in game units)', () => {
    const tokens = {
      char1: makeCharacter({
        hasVision: true,
        visionInnerRadius: 15,   // 15 feet
        visionOuterRadius: 30,   // 30 feet
      }),
    };
    const result = collectVisionSources(tokens, {}, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    // 15ft → 210px, 30ft → 420px
    expect(result[0]!.innerRadius).toBe(210);
    expect(result[0]!.outerRadius).toBe(420);
  });

  it('includes light sources (radii already in world pixels, no conversion)', () => {
    const lights = { light1: makeLight({ innerRadius: 420, outerRadius: 840 }) };
    const result = collectVisionSources({}, lights, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('light1');
    expect(result[0]!.innerRadius).toBe(420);
    expect(result[0]!.outerRadius).toBe(840);
  });

  it('uses innerRadius as outerRadius for lights when outerRadius is missing', () => {
    const lights = { light1: makeLight({ innerRadius: 420 }) };
    const result = collectVisionSources({}, lights, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result[0]!.outerRadius).toBe(420);
  });

  it('skips lights with zero radius', () => {
    const lights = { light1: makeLight({ innerRadius: 0 }) };
    const result = collectVisionSources({}, lights, defaultSettings, GRID_SIZE, UNIT_DISTANCE);

    expect(result).toHaveLength(0);
  });
});
