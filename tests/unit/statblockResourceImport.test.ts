import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { loadStatblockOverrides } from '../../src/app/packages/components/asset-manager/utils/statblockLoader';

import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';

const path = 'statblocks/Mage.md';
afterEach(() => { delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks; });
describe('resource import', () => {
  it.each([{ hp: '27 (5d8 + 5)' }, { Health: { current: 12, max: 27 } }])('imports HP %j without replacing it with a token default', async (values) => {
    const { app } = createInMemoryApp({ files: { [path]: '' } });
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [{ name: 'Mage', path, ...values }] } });
    const result = await loadStatblockOverrides(app, path);
    expect(result.hp).toEqual({ current: 'Health' in values ? 12 : 27, max: 27 });
  });

  it('loads inline statblock resources as well as bestiary creatures', async () => {
    const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: 27\nstress: 3\n```' } });
    app.vault.cachedRead = app.vault.read;
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
    expect(await loadStatblockOverrides(app, path)).toMatchObject({ hp: { current: 27, max: 27 }, stress: 0, maxStress: 3 });
  });
});


it('uses inline resources when assigning a statblock link to existing tokens', async () => {
  const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: "12/27"\nstress: 3\n```' } });
  app.vault.cachedRead = app.vault.read;
  Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
  const service = Object.assign(Object.create(TokenStatblockLinkService.prototype), { app });
  expect(await service.extractStatblockData(path)).toMatchObject({ hp: { current: 12, max: 27 }, maxHp: 27, stress: 0, maxStress: 3 });
});
