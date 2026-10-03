import { describe, expect, it, vi } from 'vitest';
import { sceneShowsSecondaryBar, storeLegacyResources } from '../../../src/app/resources/legacyResourcesMigration';
import { STR } from '../../mocks/resourceFixtures';
import type { CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';

/** A scene file as 0.4.2 writes it. */
const scene = (showStressBars: boolean | undefined, tokens: Record<string, unknown>): string => JSON.stringify({
  version: 4,
  state: { version: 4, tokenSettings: { showNameplates: true, showHPBars: true, ...(showStressBars !== undefined && { showStressBars }) }, objects: { tokens } },
});
const goblin = { kind: 'character', name: 'Goblin', hp: { current: 7, max: 7 } };
const cultist = { ...goblin, name: 'Cultist', stress: 2, maxStress: 6 };

describe('sceneShowsSecondaryBar', () => {
  it('is true for a scene that shows the bar and holds a token with a value', () => {
    expect(sceneShowsSecondaryBar(scene(true, { a: goblin, b: cultist }))).toBe(true);
    expect(sceneShowsSecondaryBar(scene(true, { b: { ...cultist, stress: { current: 0, max: 6 } } }))).toBe(true);
  });

  it('is true for a scene without token settings, which showed both bars', () => {
    expect(sceneShowsSecondaryBar(JSON.stringify({ version: 4, state: { objects: { tokens: { b: cultist } } } }))).toBe(true);
  });

  it('is false while the switch is off or no token has a value', () => {
    expect(sceneShowsSecondaryBar(scene(false, { b: cultist }))).toBe(false);
    expect(sceneShowsSecondaryBar(scene(undefined, { b: cultist }))).toBe(false);
    expect(sceneShowsSecondaryBar(scene(true, { a: goblin }))).toBe(false);
  });

  it('is false for a file that is no scene', () => {
    expect(sceneShowsSecondaryBar('not json')).toBe(false);
    expect(sceneShowsSecondaryBar('null')).toBe(false);
    expect(sceneShowsSecondaryBar('{"state":{"tokenSettings":{"showStressBars":true},"objects":{"tokens":[null]}}}')).toBe(false);
  });
});

describe('storeLegacyResources', () => {
  const run = async (
    collections: Array<{ id: string; settings?: CollectionSettings }>,
    scenes: Record<string, string[]> = {},
  ): Promise<Record<string, string[]>> => {
    const stored: Record<string, string[]> = {};
    await storeLegacyResources({
      getCollections: async () => collections,
      updateCollectionSettings: async (id, settings) => { stored[id] = settings.resources!.map((d) => d.name); },
    }, async (id) => scenes[id] ?? []);
    return stored;
  };

  it('stores the resources of every collection saved before resources existed', async () => {
    expect(await run([
      { id: 'Plain', settings: { conditions: [], defaultWidgets: { hpBar: true } } },
      { id: 'Daggerheart', settings: { conditions: [], systemPresetId: 'builtin:daggerheart', defaultWidgets: { hpBar: true, stressBar: true } } },
      { id: 'Bare' },
    ])).toEqual({ Plain: ['HP'], Daggerheart: ['HP', 'Stress'], Bare: ['HP'] });
  });

  it('adds the secondary bar a collection uses only through a scene switch', async () => {
    const dnd: CollectionSettings = { conditions: [], systemPresetId: 'builtin:dnd5e', defaultWidgets: { hpBar: true } };
    expect(await run(
      [{ id: 'Used', settings: dnd }, { id: 'Unused', settings: dnd }],
      { Used: [scene(false, { a: goblin }), scene(true, { b: cultist })], Unused: [scene(false, { b: cultist })] },
    )).toEqual({ Used: ['HP', 'Secondary resource'], Unused: ['HP'] });
  });

  it('leaves a collection alone that has its resources, an empty list too', async () => {
    const readScenes = vi.fn(async () => [scene(true, { b: cultist })]);
    const updateCollectionSettings = vi.fn();
    await storeLegacyResources({
      getCollections: async () => [
        { id: 'Own', settings: { conditions: [], resources: [STR] } },
        { id: 'None', settings: { conditions: [], resources: [] } },
      ],
      updateCollectionSettings,
    }, readScenes);
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(readScenes).not.toHaveBeenCalled();
  });

  it('stores the other collections when one cannot be read, and fails so the next start tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored: string[] = [];
    await expect(storeLegacyResources({
      getCollections: async () => [{ id: 'Broken' }, { id: 'Fine' }],
      updateCollectionSettings: async (id) => { stored.push(id); },
    }, async (id) => { if (id === 'Broken') throw new Error('unreadable'); return []; })).rejects.toThrow('Broken');
    expect(stored).toEqual(['Fine']);
  });

  it('reads no scene of a collection whose default widgets already switch the secondary bar on', async () => {
    const readScenes = vi.fn(async () => []);
    const stored: Record<string, string[]> = {};
    await storeLegacyResources({
      getCollections: async () => [{ id: 'Daggerheart', settings: { conditions: [], systemPresetId: 'builtin:daggerheart', defaultWidgets: { hpBar: true, stressBar: true } } }],
      updateCollectionSettings: async (id, settings) => { stored[id] = settings.resources!.map((d) => d.name); },
    }, readScenes);
    expect(stored).toEqual({ Daggerheart: ['HP', 'Stress'] });
    expect(readScenes).not.toHaveBeenCalled();
  });
});
