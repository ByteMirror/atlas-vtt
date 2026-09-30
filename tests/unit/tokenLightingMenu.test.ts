import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { tokenLightingEntries } from '../../src/app/react/components/context-menu/tokenLightingMenu';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
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
    item(tokenLightingEntries(store, 'a', ['a', 'b']), 'Vision').onClick?.();
    const { tokens } = store.getState().objects;
    expect(tokens.a!.vision).toEqual({ enabled: true });
    expect(tokens.b!.vision).toEqual({ enabled: true });
    expect(steps.getState().pastStates.length).toBe(before + 1);
  });

  it('hands every selected token a torch and takes it away again', () => {
    const store = setup();
    item(tokenLightingEntries(store, 'a', ['a', 'b']), 'Torch').onClick?.();
    expect(store.getState().objects.tokens.b!.light).toEqual(LIGHT_PRESETS.torch.emission);
    const entries = tokenLightingEntries(store, 'a', ['a', 'b']);
    expect(item(entries, 'Torch').checked).toBe(true);
    item(entries, 'None').onClick?.();
    expect(store.getState().objects.tokens.a!.light).toBeUndefined();
  });
});
