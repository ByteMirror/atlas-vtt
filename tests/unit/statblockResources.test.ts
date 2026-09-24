import { describe, expect, it } from 'vitest';
import { getStatblockResources, getResourceUpdate, isHitPointsKey } from '../../src/app/services/statblockResources';
import type { StatblockLayout } from '../../src/app/react/components/statblock/statblockTypes';

const daggerheart: StatblockLayout = { id: 'daggerheart-adversary', name: 'Daggerheart Adversary', blocks: [] };
const basic: StatblockLayout = { id: 'basic', name: 'Basic', blocks: [] };

describe('statblock resource translation', () => {
  it('maps Daggerheart tracks to missing HP and spent stress, with token state authoritative', () => {
    const resources = getStatblockResources({ hp: 8, stress: 3 }, daggerheart, {
      hp: { current: 4, max: 9 }, stress: 0, maxStress: 4,
    });
    expect(resources).toMatchObject([
      { key: 'hp', current: 4, max: 9, display: 'pips', spent: false },
      { key: 'stress', current: 0, max: 4, display: 'pips', spent: true },
    ]);
    expect(getResourceUpdate({}, resources[0]!, 20)).toEqual({ hp: { current: 9, max: 9 } });
    expect(getResourceUpdate({}, resources[1]!, -1)).toEqual({ stress: 0, maxStress: 4 });
  });

  it.each([27, '27', '27 (5d8 + 5)', { current: 12, max: 27 }, '12/27'])(
    'translates numeric HP or bounded HP %j into a gauge', (hp) => {
      expect(getStatblockResources({ hp }, basic, { hp: 0 })[0]).toMatchObject({
        key: 'hp', current: 0, max: 27, display: 'gauge', spent: false,
      });
    },
  );

  it('supports health aliases, named resources, and bounded custom gauges without editing combat statistics', () => {
    const resources = getStatblockResources({
      Health: '12', ac: 18, atk: 3, tier: 1,
      mana: { value: 3, max: 7 }, battery: { current: 2, max: 5 },
      resources: { Momentum: { current: 0, max: 6 } },
    }, basic, { statblockResources: { mana: { current: 0, max: 8 } } });
    expect(resources).toMatchObject([
      { key: 'hp', current: 12, max: 12 },
      { key: 'mana', current: 0, max: 8 },
      { key: 'battery', current: 2, max: 5 },
      { key: 'resources.Momentum', current: 0, max: 6 },
    ]);
    expect(getResourceUpdate({ statblockResources: { battery: { current: 1, max: 5 } } }, resources[1]!, 4))
      .toEqual({ statblockResources: { battery: { current: 1, max: 5 }, mana: { current: 4, max: 8 } } });
  });

  it('translates Fate-style stress arrays into separate named tracks', () => {
    const layout: StatblockLayout = { ...basic, blocks: [
      { id: 'stress', type: 'table', properties: ['stress'], headers: ['Physical', 'Mental'] },
    ] };
    expect(getStatblockResources({ stress: [3, 2] }, layout, {})).toMatchObject([
      { key: 'stress.0', label: 'Physical stress', max: 3, current: 0, display: 'pips', spent: true },
      { key: 'stress.1', label: 'Mental stress', max: 2, current: 0, display: 'pips', spent: true },
    ]);
  });

  it('does not invent numeric resources from descriptive text, dice expressions, or invalid values', () => {
    expect(getStatblockResources({ hp: '5d8+5', stress: 'Immune', mana: NaN, stamina: -1, health: Infinity }, basic, {}))
      .toEqual([]);
  });

  it('keeps explicit zero maxima and object stress/hope state', () => {
    const token = { hp: { current: 0, max: 0 }, stress: { current: 2, max: 3 }, hope: { current: 1, max: 6 } };
    const resources = getStatblockResources({ hp: 8, stress: 3, hope: 6 }, basic, token);
    expect(resources).toMatchObject([{ current: 0, max: 0 }, { current: 2, max: 3 }, { current: 1, max: 6 }]);
    expect(getResourceUpdate(token, resources[1]!, 3)).toEqual({ stress: { current: 3, max: 3 }, maxStress: 3 });
    expect(getResourceUpdate(token, resources[2]!, 4)).toEqual({ hope: { current: 4, max: 6 } });
  });
});

describe('isHitPointsKey', () => {
  it('recognizes hit point keys and labels across systems', () => {
    expect(['hp', 'HP', 'Hit Points:', 'hit_points', 'Health'].map(isHitPointsKey)).not.toContain(false);
    expect(['Hit Dice', 'hope', 'AC', ''].map(isHitPointsKey)).not.toContain(true);
  });
});
