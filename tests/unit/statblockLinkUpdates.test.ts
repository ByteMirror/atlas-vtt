import { expect, it } from 'vitest';
import { buildStatblockLinkUpdates } from '../../src/app/pixi/token-renderer/statblockFrontmatter';
import { HP, STRESS } from '../mocks/resourceFixtures';

it('starts the resources the statblock supplies and keeps what the token held of the others', () => {
  const held = { hp: { current: 3, max: 12 }, stress: { current: 2, max: 6 }, mana: { current: 1, max: 8 } };
  expect(buildStatblockLinkUpdates({ name: 'Mage', hp: 27 }, 'Hero', [HP, STRESS], held).resources).toEqual({
    hp: { current: 27, max: 27 }, stress: { current: 2, max: 6 }, mana: { current: 1, max: 8 },
  });
  // A statblock without hit points leaves hand-set ones alone
  expect(buildStatblockLinkUpdates({ name: 'Ghost' }, 'Hero', [HP], { hp: { current: 3, max: 12 } }).resources).toEqual({ hp: { current: 3, max: 12 } });
  expect(buildStatblockLinkUpdates({ name: 'Goblin', hp: 7 }, 'Hero', [HP], undefined).resources).toEqual({ hp: { current: 7, max: 7 } });
});
