import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { tokenLightingEntries } from '../../src/app/react/components/context-menu/tokenLightingMenu';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

type Item = Extract<ContextMenuEntry, { type: 'item' }>;

function setup(): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `token-lighting-${Math.random()}`);
  const token = (id: string): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0 });
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { a: token('a'), b: token('b') } } });
  return store;
}

// The lights as a map on a 5-foot grid offers them.
const FEET = { unitType: 'feet', unitDistance: 5 } as const;
const dnd5e = lightPresetsOnMap(BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!, FEET, Infinity);
const GENERIC = lightPresetsOnMap(GENERIC_LIGHT_PRESETS, FEET, Infinity);
const generic = (name: string) => GENERIC.find((preset) => preset.name === name)!;

function labels(entries: ContextMenuEntry[], submenu: string): string[] {
  const entry = entries.find((candidate) => candidate.type === 'submenu' && candidate.label === submenu);
  if (entry?.type !== 'submenu') throw new Error(`no ${submenu}`);
  const children = typeof entry.children === 'function' ? entry.children() : entry.children;
  return children.flatMap((child) => (child.type === 'item' ? [child.label] : []));
}

function item(entries: ContextMenuEntry[], label: string): Item {
  for (const entry of entries) {
    if (entry.type === 'item' && entry.label === label) return entry;
    if (entry.type === 'submenu') {
      const children = typeof entry.children === 'function' ? entry.children() : entry.children;
      const found = children.find((child): child is Item => child.type === 'item' && child.label === label);
      if (found) return found;
    }
  }
  throw new Error(`no ${label}`);
}

describe('tokenLightingEntries', () => {
  it('gives the whole selection vision in one undo step', () => {
    const store = setup();
    const steps = getHistoryStore(store)!;
    const before = steps.getState().pastStates.length;
    item(tokenLightingEntries(store, 'a', ['a', 'b'], GENERIC), 'Vision').onClick?.();
    const { tokens } = store.getState().objects;
    expect(tokens.a!.vision).toEqual({ enabled: true });
    expect(tokens.b!.vision).toEqual({ enabled: true });
    expect(steps.getState().pastStates.length).toBe(before + 1);
  });

  it('hands every selected token a torch and takes it away again', () => {
    const store = setup();
    item(tokenLightingEntries(store, 'a', ['a', 'b'], GENERIC), 'Torch').onClick?.();
    expect(store.getState().objects.tokens.b!.light).toEqual(emissionOf(generic('Torch')));
    const entries = tokenLightingEntries(store, 'a', ['a', 'b'], GENERIC);
    expect(item(entries, 'Torch').checked).toBe(true);
    item(entries, 'None').onClick?.();
    expect(store.getState().objects.tokens.a!.light).toBeUndefined();
  });

  it('lists the light presets of the map\'s collection', () => {
    const store = setup();
    expect(labels(tokenLightingEntries(store, 'a', ['a'], GENERIC), 'Carry light')).toEqual(['None', 'Candle', 'Torch', 'Lantern', 'Magical light', 'Darkness']);
    expect(labels(tokenLightingEntries(store, 'a', ['a'], dnd5e), 'Carry light')).toEqual(['None', ...dnd5e.map((preset) => preset.name)]);
    item(tokenLightingEntries(store, 'a', ['a'], dnd5e), 'Lamp').onClick?.();
    expect(store.getState().objects.tokens.a!.light).toMatchObject({ bright: 15, dim: 45, kind: 'lantern' });
  });

  it('ticks the preset a carried light came from, also once the light was edited, and nothing for a custom light', () => {
    const store = setup();
    const lamp = dnd5e.find((preset) => preset.name === 'Lamp')!;
    store.getState().updateToken('a', { light: { ...emissionOf(lamp), bright: 25 } });
    const ticked = (): string[] => {
      const entry = tokenLightingEntries(store, 'a', ['a'], dnd5e).find((candidate) => candidate.type === 'submenu');
      const children = entry?.type === 'submenu' && Array.isArray(entry.children) ? entry.children : [];
      return children.flatMap((child) => (child.type === 'item' && child.checked ? [child.label] : []));
    };
    expect(ticked()).toEqual(['Lamp']);
    store.getState().updateToken('a', { light: { ...emissionOf(lamp), kind: 'custom' } });
    expect(ticked()).toEqual([]);
  });
});
