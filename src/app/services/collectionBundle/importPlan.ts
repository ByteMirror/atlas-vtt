import type { InstalledItem } from './installRecord';

/**
 * Three-way import planning. Every file, asset record and collection field is
 * compared as base (what the last import installed), mine (the vault now) and
 * theirs (the bundle). Pure: callers gather the fingerprints.
 */

export type PlanItemKind = 'file' | 'asset' | 'field';

export interface PlanItemInput {
  /** Unique across the plan, e.g. `file:<bundle path>`. */
  key: string;
  kind: PlanItemKind;
  /** Items of one unit (an asset with its files) are decided together. */
  unit: string;
  /** Fingerprint of the bundle's item, or null when the bundle no longer has it. */
  theirs: string | null;
  base: InstalledItem | null;
  /** Fingerprint of the vault's item, or null when it is missing. */
  mine: string | null;
  /** What `mine` would be right after installing theirs, when that can be known in advance. */
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

export type ItemStatus = 'unchanged' | 'added' | 'updated' | 'removed' | 'kept' | 'restored' | 'conflict';

export interface PlannedItem extends PlanItemInput {
  status: ItemStatus;
  conflict?: ConflictReason;
}

export type UnitStatus = 'added' | 'updated' | 'removed' | 'kept' | 'restored' | 'conflict' | 'unchanged';

export interface PlannedUnit {
  key: string;
  status: UnitStatus;
  /** The most telling reason among the unit's conflicting items. */
  conflict?: ConflictReason;
  items: PlannedItem[];
}

export interface ImportPlan {
  units: PlannedUnit[];
  counts: Record<UnitStatus, number>;
}

export type Resolution = 'mine' | 'theirs';
export type ImportAction = 'write' | 'remove';

/** Re-applies the bundle over everything the user changed, instead of keeping their changes. */
export interface PlanOptions {
  restore?: boolean;
}

function planItem(item: PlanItemInput, { restore = false }: PlanOptions): PlannedItem {
  const { theirs, base, mine, theirsInstalled } = item;
  const matchesTheirs = theirsInstalled !== undefined && mine === theirsInstalled;
  if (!base) {
    if (theirs === null) return { ...item, status: 'unchanged' };
    if (mine === null) return { ...item, status: 'added' };
    if (matchesTheirs) return { ...item, status: 'unchanged' };
    if (restore) return { ...item, status: 'restored' };
    // Without a record and without knowing what installing it yields, a difference says nothing: keep it.
    if (theirsInstalled === undefined) return { ...item, status: 'unchanged' };
    return { ...item, status: 'conflict', conflict: 'unknown-origin' };
  }
  const theirsChanged = theirs !== base.source;
  const mineChanged = mine !== base.installed;
  if (!theirsChanged) {
    if (!mineChanged || matchesTheirs) return { ...item, status: 'unchanged' };
    return { ...item, status: restore ? 'restored' : 'kept' };
  }
  if (!mineChanged) return { ...item, status: theirs === null ? 'removed' : 'updated' };
  if (theirs === null && mine === null) return { ...item, status: 'unchanged' };
  if (matchesTheirs) return { ...item, status: 'unchanged' };
  if (restore) return { ...item, status: theirs === null ? 'removed' : 'restored' };
  const conflict: ConflictReason = theirs === null ? 'removed-by-update' : mine === null ? 'deleted-by-you' : 'both-changed';
  return { ...item, status: 'conflict', conflict };
}

const CONFLICT_PRIORITY: readonly ConflictReason[] = ['removed-by-update', 'both-changed', 'deleted-by-you', 'unknown-origin'];

function unitStatus(items: readonly PlannedItem[]): Pick<PlannedUnit, 'status' | 'conflict'> {
  const record = items.find((item) => item.kind === 'asset');
  const conflicts = items.filter((item) => item.status === 'conflict');
  // An asset the update removes but the user changed stays or goes as a whole.
  if (record?.status === 'removed' && items.some((item) => item.status === 'kept' || item.status === 'conflict')) {
    return { status: 'conflict', conflict: 'removed-by-update' };
  }
  if (conflicts.length > 0) {
    const conflict = CONFLICT_PRIORITY.find((reason) => conflicts.some((item) => item.conflict === reason));
    return conflict ? { status: 'conflict', conflict } : { status: 'conflict' };
  }
  const statuses = new Set(items.map((item) => item.status));
  if (record?.status === 'removed' || (statuses.has('removed') && items.every((item) => item.status === 'removed' || item.status === 'unchanged'))) return { status: 'removed' };
  if (record?.status === 'added' || (statuses.has('added') && items.every((item) => item.status === 'added' || item.status === 'unchanged'))) return { status: 'added' };
  if (statuses.has('added') || statuses.has('updated') || statuses.has('removed')) return { status: 'updated' };
  if (statuses.has('restored')) return { status: 'restored' };
  if (statuses.has('kept')) return { status: 'kept' };
  return { status: 'unchanged' };
}

export function planImport(inputs: readonly PlanItemInput[], options: PlanOptions = {}): ImportPlan {
  const byUnit = new Map<string, PlannedItem[]>();
  for (const input of inputs) {
    const items = byUnit.get(input.unit) ?? [];
    items.push(planItem(input, options));
    byUnit.set(input.unit, items);
  }
  const counts: Record<UnitStatus, number> = { added: 0, updated: 0, removed: 0, kept: 0, restored: 0, conflict: 0, unchanged: 0 };
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

/**
 * What to do with each item once the user resolved the conflicts; units without
 * a resolution keep the user's version. Items missing from the map stay as they are.
 */
export function resolvePlan(plan: ImportPlan, resolutions: ReadonlyMap<string, Resolution>): Map<string, ImportAction> {
  const actions = new Map<string, ImportAction>();
  for (const unit of plan.units) {
    const takeTheirs = unit.status === 'conflict' && resolutions.get(unit.key) === 'theirs';
    for (const item of unit.items) {
      const status = unit.status === 'conflict' ? (takeTheirs ? 'take' : 'keep') : item.status;
      if (status === 'keep' || status === 'unchanged' || status === 'kept') continue;
      if (status === 'take') {
        if (item.theirs === null ? item.mine !== null : item.mine !== item.theirsInstalled || item.theirsInstalled === undefined) {
          actions.set(item.key, item.theirs === null ? 'remove' : 'write');
        }
        continue;
      }
      actions.set(item.key, status === 'removed' ? 'remove' : 'write');
    }
  }
  return actions;
}
