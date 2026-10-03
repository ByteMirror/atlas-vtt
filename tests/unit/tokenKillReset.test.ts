import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STR, STRESS } from '../mocks/resourceFixtures';

function storeWith(resources: NonNullable<Character['resources']>) {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `kill-reset-${Math.random()}`);
  const token: Character = { id: 't1', kind: 'character', name: 'Troll', imagePath: 'troll.png', x: 0, y: 0, resources, conditions: ['prone'], conditionValues: { prone: 2 } };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t1: token } } });
  return { store, token: (): Character => store.getState().objects.tokens.t1 as Character };
}

describe('killing and resetting tokens', () => {
  it('kill spends only the resources that defeat the token', () => {
    const { store, token } = storeWith({ hp: { current: 9, max: 14 }, str: { current: 14, max: 14 } });
    store.getState().killTokens(['t1'], [HP, STR]);
    expect(token().resources).toEqual({ hp: { current: 0, max: 14 }, str: { current: 14, max: 14 } });
  });

  it('reset returns every defined resource to its start and clears conditions', () => {
    const { store, token } = storeWith({ hp: { current: 2, max: 14 }, stress: { current: 5, max: 6 }, mana: { current: 1, max: 4 } });
    store.getState().resetTokens(['t1'], [HP, STRESS]);
    expect(token().resources).toEqual({ hp: { current: 14, max: 14 }, stress: { current: 0, max: 6 }, mana: { current: 1, max: 4 } });
    expect(token().conditions).toBeUndefined();
    expect(token().conditionValues).toBeUndefined();
  });
});
