import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import { rollHitPoints } from '../../src/app/services/statblockHitPoints';

interface Roll {
  formula: string;
  source: Record<string, unknown>;
}

/** An open map view with a dice tool that returns `totals` in order, and a store holding `tokenIds`. */
function mapView(totals: number[], tokenIds: string[], isPlayerView = false) {
  const rolls: Roll[] = [];
  const updateTokens = vi.fn();
  const view = {
    serviceManager: { getToolController: () => ({ getDiceTool: () => ({
      rollDice: (formula: string, source: Record<string, unknown>) => {
        rolls.push({ formula, source });
        return { formula, total: totals[rolls.length - 1] ?? 0 };
      },
    }) }) },
    getStore: () => ({ getState: () => ({
      isPlayerView,
      objects: { tokens: Object.fromEntries(tokenIds.map((id) => [id, { id }])) },
      updateTokens,
    }) }),
  };
  return { view, rolls, updateTokens };
}

const appWith = (...views: unknown[]) => ({ workspace: { getLeavesOfType: () => views.map((view) => ({ view })) } }) as never;

describe('rollHitPoints', () => {
  it('rolls once per token and puts each at full health with its own result', () => {
    const { view, rolls, updateTokens } = mapView([9, 4], ['a', 'b']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [
      { id: 'a', name: 'Goblin', hp: { current: 2, max: 7 } },
      { id: 'b', name: 'Goblin', hp: 7 },
    ], 'Hit Points');

    expect(rolls.map((roll) => [roll.formula, roll.source.tokenId, roll.source.abilityName]))
      .toEqual([['2d6', 'a', 'Hit Points'], ['2d6', 'b', 'Hit Points']]);
    expect(updateTokens).toHaveBeenCalledOnce();
    expect(updateTokens).toHaveBeenCalledWith([
      { id: 'a', changes: { hp: { current: 9, max: 9 }, maxHpOverridden: true } },
      { id: 'b', changes: { hp: { current: 4, max: 4 }, maxHpOverridden: true } },
    ]);
  });

  it('never rolls a creature below 1 hit point', () => {
    const { view, updateTokens } = mapView([-1], ['a']);
    rollHitPoints(appWith(view), '1d4-3', 'Rat.md', [{ id: 'a' }]);
    expect(updateTokens).toHaveBeenCalledWith([{ id: 'a', changes: { hp: { current: 1, max: 1 }, maxHpOverridden: true } }]);
  });

  it('writes to the game master view, never a player view of the same map', () => {
    const player = mapView([], ['a'], true);
    const gm = mapView([6], ['a']);
    rollHitPoints(appWith(player.view, gm.view), '2d6', 'Goblin.md', [{ id: 'a' }]);
    expect(player.updateTokens).not.toHaveBeenCalled();
    expect(gm.updateTokens).toHaveBeenCalledOnce();
  });

  it('is an ordinary roll when no placed token is linked', () => {
    const { view, rolls, updateTokens } = mapView([8], ['other']);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ name: 'Goblin' }]);
    rollHitPoints(appWith(view), '2d6', 'Goblin.md', [{ id: 'not-on-this-map' }]);
    expect(rolls).toHaveLength(2);
    expect(rolls[0]!.source).toEqual({ type: 'statblock', statblockPath: 'Goblin.md' });
    expect(updateTokens).not.toHaveBeenCalled();
  });
});
