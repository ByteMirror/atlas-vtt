import type { InstalledItem } from './installRecord';

/**
 * Three-way import planning. Every file, asset record and collection field is
 * compared as base (what the last import installed), mine (the vault now) and
 * theirs (the bundle). Pure: callers gather the fingerprints.
 */

export interface PlanItemInput {
  /** Unique across the plan, e.g. `file:<bundle path>`. */
  key: string;
  kind: 'file' | 'asset' | 'field';
  /** Items of one unit (an asset with its files) are decided together. */
  unit: string;
  /** Fingerprint of the bundle's item, or null when the bundle no longer has it. */
  theirs: string | null;
  base: InstalledItem | null;
  /** Fingerprint of the vault's item, or null when it is missing. */
  mine: string | null;
  /** What `mine` is right after installing theirs; set whenever `theirs` is. */
  theirsInstalled?: string | undefined;
}

export type ConflictReason =
  /** You and the update both changed it. */
  | 'both-changed'
  /** You deleted it; the update changes it. */
  | 'deleted-by-you'
  /** The update removes it; you changed it. */
  | 'removed-by-update'
  /** No record of what was installed, and your version differs from the update. */
  | 'unknown-origin';

export type ChangeStatus = 'unchanged' | 'added' | 'updated' | 'removed' | 'kept' | 'restored' | 'conflict';

export interface PlannedItem extends PlanItemInput {
  status: ChangeStatus;
  conflict?: ConflictReason;
}

export interface PlannedUnit {
  key: string;
  status: ChangeStatus;
  /** The most telling reason among the unit's conflicting items. */
  conflict?: ConflictReason;
  items: PlannedItem[];
}

export interface ImportPlan {
  units: PlannedUnit[];
  counts: Record<ChangeStatus, number>;
}

export type Resolution = 'mine' | 'theirs';
export type ImportAction = 'write' | 'remove';

function planItem(item: PlanItemInput, restore: boolean): PlannedItem {
  const { theirs, base, mine, theirsInstalled } = item;
  const matchesTheirs = theirs !== null && mine === theirsInstalled;
  if (!base) {
    if (theirs === null || matchesTheirs) return { ...item, status: 'unchanged' };
    if (mine === null) return { ...item, status: 'added' };
    return restore ? { ...item, status: 'restored' } : { ...item, status: 'conflict', conflict: 'unknown-origin' };
  }
  const theirsChanged = theirs !== base.source;
  const mineChanged = mine !== base.installed;
  if (!mineChanged) {
    if (!theirsChanged) return { ...item, status: 'unchanged' };
    return { ...item, status: theirs === null ? 'removed' : 'updated' };
  }
  if (matchesTheirs || (theirs === null && mine === null)) return { ...item, status: 'unchanged' };
  if (!theirsChanged) return { ...item, status: restore ? 'restored' : 'kept' };
  if (restore) return { ...item, status: theirs === null ? 'removed' : 'restored' };
  const conflict: ConflictReason = theirs === null ? 'removed-by-update' : mine === null ? 'deleted-by-you' : 'both-changed';
  return { ...item, status: 'conflict', conflict };
}

const CONFLICT_PRIORITY: readonly ConflictReason[] = ['removed-by-update', 'both-changed', 'deleted-by-you', 'unknown-origin'];

function unitStatus(items: readonly PlannedItem[]): Pick<PlannedUnit, 'status' | 'conflict'> {
  const record = items.find((item) => item.kind === 'asset');
  // An asset the update removes but the user changed stays or goes as a whole.
  if (record?.status === 'removed' && items.some((item) => item.status === 'kept' || item.status === 'conflict')) {
    return { status: 'conflict', conflict: 'removed-by-update' };
  }
  const conflict = CONFLICT_PRIORITY.find((reason) => items.some((item) => item.conflict === reason));
  if (conflict) return { status: 'conflict', conflict };
  const only = (...statuses: ChangeStatus[]): boolean => items.every((item) => item.status === 'unchanged' || statuses.includes(item.status));
  const has = (status: ChangeStatus): boolean => items.some((item) => item.status === status);
  if (record?.status === 'removed' || (has('removed') && only('removed'))) return { status: 'removed' };
  if (record?.status === 'added' || (has('added') && only('added'))) return { status: 'added' };
  if (has('added') || has('updated') || has('removed')) return { status: 'updated' };
  if (has('restored')) return { status: 'restored' };
  return { status: has('kept') ? 'kept' : 'unchanged' };
}

/** Plans an import; `restore` re-applies the bundle over the user's changes instead of keeping them. */
export function planImport(inputs: readonly PlanItemInput[], { restore = false } = {}): ImportPlan {
  const byUnit = new Map<string, PlannedItem[]>();
  for (const input of inputs) {
    byUnit.set(input.unit, [...(byUnit.get(input.unit) ?? []), planItem(input, restore)]);
  }
  const counts: Record<ChangeStatus, number> = { added: 0, updated: 0, removed: 0, kept: 0, restored: 0, conflict: 0, unchanged: 0 };
  const units = [...byUnit].map(([key, items]): PlannedUnit => {
    const unit: PlannedUnit = { key, ...unitStatus(items), items };
    counts[unit.status] += 1;
    return unit;
  });
  return { units, counts };
}

/** Whether applying the plan would change anything, before conflicts are decided. */
export function planHasChanges(plan: ImportPlan): boolean {
  return plan.units.some((unit) => unit.status !== 'unchanged' && unit.status !== 'kept');
}

/** The action the item's own status calls for. */
function itemAction(item: PlannedItem): ImportAction | undefined {
  if (item.status === 'removed') return 'remove';
  return item.status === 'added' || item.status === 'updated' || item.status === 'restored' ? 'write' : undefined;
}

/** The action that makes the item match the bundle, if it does not already. */
function updateAction(item: PlannedItem): ImportAction | undefined {
  if (item.mine === (item.theirs === null ? null : item.theirsInstalled)) return undefined;
  return item.theirs === null ? 'remove' : 'write';
}

/**
 * What a unit whose conflicts the user resolved as their own still takes from
 * the update. When the asset record itself follows the update (or has none),
 * every non-conflicting item does. When the user keeps their record, it may
 * still name the old files, so nothing is added or removed and only files it
 * already has are updated; an asset the user deleted gets nothing back.
 */
function keptUnitAction(unit: PlannedUnit, item: PlannedItem): ImportAction | undefined {
  if (item.status === 'conflict' || unit.conflict === 'removed-by-update') return undefined;
  const record = unit.items.find((entry) => entry.kind === 'asset');
  const recordFollows = !record || record.status === 'updated' || record.status === 'unchanged' || record.status === 'kept';
  if (recordFollows) return itemAction(item);
  return record.mine !== null && item.status === 'updated' ? 'write' : undefined;
}

/**
 * What to do with each item once the user resolved the conflicts. Taking the
 * update writes or removes every item of the unit that differs from the bundle;
 * keeping the user's version keeps the conflicting items (see `keptUnitAction`).
 */
export function resolvePlan(plan: ImportPlan, resolutions: ReadonlyMap<string, Resolution>): Map<string, ImportAction> {
  const actions = new Map<string, ImportAction>();
  for (const unit of plan.units) {
    const isConflict = unit.status === 'conflict';
    const takeTheirs = isConflict && resolutions.get(unit.key) === 'theirs';
    for (const item of unit.items) {
      const action = takeTheirs ? updateAction(item) : isConflict ? keptUnitAction(unit, item) : itemAction(item);
      if (action) actions.set(item.key, action);
    }
  }
  return actions;
}
