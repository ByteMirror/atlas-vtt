import { describe, expect, it } from 'vitest';
import { planHasChanges, planImport, resolvePlan, type PlanItemInput } from '../../src/app/services/collectionBundle/importPlan';

const base = { source: 'v1', installed: 'i1' };

function item(overrides: Partial<PlanItemInput>): PlanItemInput {
  return { key: 'file:a', kind: 'file', unit: 'u', theirs: 'v1', base, mine: 'i1', theirsInstalled: 'i1', ...overrides };
}

const statusOf = (input: Partial<PlanItemInput>, restore = false): string => {
  const [unit] = planImport([item(input)], { restore }).units;
  return unit!.items[0]!.conflict ?? unit!.items[0]!.status;
};

describe('three-way item planning', () => {
  it.each([
    ['nothing changed', {}, 'unchanged'],
    ['only the update changed it', { theirs: 'v2', theirsInstalled: 'i2' }, 'updated'],
    ['only the update removed it', { theirs: null, theirsInstalled: undefined }, 'removed'],
    ['only you changed it', { mine: 'mine' }, 'kept'],
    ['only you deleted it', { mine: null }, 'kept'],
    ['both changed it the same way', { theirs: 'v2', theirsInstalled: 'i2', mine: 'i2' }, 'unchanged'],
    ['both changed it differently', { theirs: 'v2', theirsInstalled: 'i2', mine: 'mine' }, 'both-changed'],
    ['you deleted what the update changes', { theirs: 'v2', theirsInstalled: 'i2', mine: null }, 'deleted-by-you'],
    ['the update removes what you changed', { theirs: null, theirsInstalled: undefined, mine: 'mine' }, 'removed-by-update'],
    ['both removed it', { theirs: null, theirsInstalled: undefined, mine: null }, 'unchanged'],
    ['new in the update', { base: null, mine: null }, 'added'],
    ['only yours, never installed', { base: null, theirs: null, theirsInstalled: undefined }, 'unchanged'],
    ['no install record and yours differs', { base: null, mine: 'mine' }, 'unknown-origin'],
    ['no install record and yours matches', { base: null }, 'unchanged'],
  ] as const)('%s', (_name, input, expected) => {
    expect(statusOf(input)).toBe(expected);
  });

  it('restores what the user changed or deleted when asked to', () => {
    expect(statusOf({ mine: 'mine' }, true)).toBe('restored');
    expect(statusOf({ mine: null }, true)).toBe('restored');
    expect(statusOf({ theirs: 'v2', theirsInstalled: 'i2', mine: 'mine' }, true)).toBe('restored');
    expect(statusOf({ base: null, mine: 'mine' }, true)).toBe('restored');
    expect(statusOf({}, true)).toBe('unchanged');
  });
});

describe('units', () => {
  it('turns a removed asset the user changed into one conflict for the whole unit', () => {
    const plan = planImport([
      item({ key: 'asset:scene', kind: 'asset', unit: 'asset:scene', theirs: null, theirsInstalled: undefined }),
      item({ key: 'file:scene.atlasmap', unit: 'asset:scene', theirs: null, theirsInstalled: undefined, mine: 'played on' }),
    ]);
    expect(plan.units[0]).toMatchObject({ status: 'conflict', conflict: 'removed-by-update' });
    expect(plan.counts.conflict).toBe(1);
    expect(resolvePlan(plan, new Map())).toEqual(new Map());
    expect(resolvePlan(plan, new Map([['asset:scene', 'theirs']]))).toEqual(new Map([
      ['asset:scene', 'remove'], ['file:scene.atlasmap', 'remove'],
    ]));
  });

  it('counts units by their most important change', () => {
    const plan = planImport([
      item({ key: 'asset:new', kind: 'asset', unit: 'asset:new', base: null, mine: null }),
      item({ key: 'file:new.webp', unit: 'asset:new', base: null, mine: null }),
      item({ key: 'asset:old', kind: 'asset', unit: 'asset:old', theirs: null, theirsInstalled: undefined }),
      item({ key: 'asset:edited', kind: 'asset', unit: 'asset:edited', mine: 'renamed' }),
      item({ key: 'asset:touched', kind: 'asset', unit: 'asset:touched', theirs: 'v2', theirsInstalled: 'i2' }),
      item({ key: 'file:same', unit: 'file:same' }),
    ]);
    expect(plan.counts).toMatchObject({ added: 1, removed: 1, kept: 1, updated: 1, unchanged: 1, conflict: 0 });
    expect(planHasChanges(plan)).toBe(true);
    expect(planHasChanges(planImport([item({ mine: 'mine' })]))).toBe(false);
  });

  it('keeps every item of a conflicting unit with the user unless they take the update', () => {
    const plan = planImport([
      item({ key: 'asset:cave', kind: 'asset', unit: 'asset:cave', theirs: 'v2', theirsInstalled: 'i2' }),
      item({ key: 'file:cave.atlasmap', unit: 'asset:cave', theirs: 'v2', theirsInstalled: 'i2', mine: 'played on' }),
      item({ key: 'file:cave.thumb.jpg', unit: 'asset:cave', theirs: 'v2', theirsInstalled: 'i2', mine: 'i2' }),
    ]);
    expect(plan.units[0]).toMatchObject({ status: 'conflict', conflict: 'both-changed' });
    expect(resolvePlan(plan, new Map([['asset:cave', 'mine']]))).toEqual(new Map());
    // The thumbnail already matches the update, so taking it writes only what differs.
    expect(resolvePlan(plan, new Map([['asset:cave', 'theirs']]))).toEqual(new Map([
      ['asset:cave', 'write'], ['file:cave.atlasmap', 'write'],
    ]));
  });

  it('writes additions and updates and removes what the update removed', () => {
    const plan = planImport([
      item({ key: 'file:new', unit: 'file:new', base: null, mine: null }),
      item({ key: 'file:changed', unit: 'file:changed', theirs: 'v2', theirsInstalled: 'i2' }),
      item({ key: 'file:gone', unit: 'file:gone', theirs: null, theirsInstalled: undefined }),
      item({ key: 'file:yours', unit: 'file:yours', mine: 'mine' }),
    ]);
    expect(resolvePlan(plan, new Map())).toEqual(new Map([
      ['file:new', 'write'], ['file:changed', 'write'], ['file:gone', 'remove'],
    ]));
  });
});
