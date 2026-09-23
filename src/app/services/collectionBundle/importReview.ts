import type { Asset, CollectionMetadata } from '../AssetService';
import type { BundleKind, CollectionBundleManifest } from './bundleFormat';
import type { CollectionField, InstallRecord } from './installRecord';
import { planHasChanges, type ConflictReason, type ImportPlan, type UnitStatus } from './importPlan';

/** How the bundle's version relates to the one in the vault. */
export type ImportRelation = 'new' | 'newer' | 'same' | 'older';

export interface ReviewUnit {
  key: string;
  /** What it is, e.g. "Scene" or "Collection settings". */
  kind: string;
  name: string;
  reason: ConflictReason;
}

/** Everything the import dialog shows before the user decides. */
export interface ImportReview {
  collectionName: string;
  /** Name of the vault's copy, when it has one. */
  localName?: string | undefined;
  author?: string | undefined;
  version: number;
  installedVersion?: number | undefined;
  relation: ImportRelation;
  kind: BundleKind;
  releaseNotes?: string | undefined;
  exportedAt: number;
  /** False for copies imported before Atlas recorded installs: every difference is then a conflict. */
  hasInstallRecord: boolean;
  /** A new collection whose name another collection already uses. */
  suggestedName?: string | undefined;
  counts: Record<UnitStatus, number>;
  conflicts: ReviewUnit[];
  /** Whether importing would change anything, conflicts aside. */
  hasChanges: boolean;
  /** Whether "restore original" would change anything the normal import keeps. */
  canRestore: boolean;
  assetCount: number;
  fileCount: number;
}

const ASSET_KINDS: Record<Asset['type'], string> = {
  token: 'Token', map: 'Map', note: 'Note', statblock: 'Statblock',
  character: 'Character', scene: 'Scene', encounter: 'Encounter', player: 'Player',
};

const FIELD_NAMES: Record<CollectionField, string> = {
  name: 'Collection name', description: 'Description', tags: 'Tags', settings: 'Collection settings',
};

function describeUnit(key: string, unitAssets: ReadonlyMap<string, Asset>): Pick<ReviewUnit, 'kind' | 'name'> {
  const asset = unitAssets.get(key);
  if (asset) return { kind: ASSET_KINDS[asset.type] ?? 'Asset', name: asset.name };
  if (key.startsWith('field:')) return { kind: 'Collection', name: FIELD_NAMES[key.slice('field:'.length) as CollectionField] ?? key };
  const path = key.slice(key.indexOf(':') + 1);
  return { kind: 'File', name: path.slice(path.lastIndexOf('/') + 1) };
}

function relationOf(version: number, installedVersion: number | undefined): ImportRelation {
  if (installedVersion === undefined) return 'new';
  if (version > installedVersion) return 'newer';
  return version === installedVersion ? 'same' : 'older';
}

export function buildReview(
  manifest: CollectionBundleManifest,
  existing: CollectionMetadata | null,
  record: InstallRecord | null,
  plan: ImportPlan,
  restorePlan: ImportPlan,
  unitAssets: ReadonlyMap<string, Asset>,
  suggestedName: string | undefined,
): ImportReview {
  const { collection } = manifest;
  const installedVersion = existing ? record?.version ?? existing.version : undefined;
  const conflicts = plan.units
    .filter((unit) => unit.status === 'conflict' && unit.conflict)
    .map((unit): ReviewUnit => ({ key: unit.key, ...describeUnit(unit.key, unitAssets), reason: unit.conflict! }));
  return {
    collectionName: collection.name,
    localName: existing?.name,
    author: collection.author,
    version: collection.version,
    installedVersion,
    relation: relationOf(collection.version, installedVersion),
    kind: manifest.release?.kind ?? 'release',
    releaseNotes: manifest.release?.notes,
    exportedAt: manifest.exportedAt,
    hasInstallRecord: record !== null,
    suggestedName,
    counts: plan.counts,
    conflicts,
    hasChanges: planHasChanges(plan),
    canRestore: existing !== null && restorePlan.counts.restored > 0,
    assetCount: manifest.assets.length,
    fileCount: manifest.files.length,
  };
}
