import type { Asset, CollectionMetadata } from '../AssetService';
import type { BundleKind, CollectionBundleManifest } from './bundleFormat';
import type { CollectionField, InstallRecord } from './installRecord';
import { planHasChanges, type ChangeStatus, type ConflictReason, type ImportPlan } from './importPlan';
import { baseName } from '../../utils/pathUtils';

/** How the bundle's version relates to the one in the vault. */
type ImportRelation = 'new' | 'newer' | 'same' | 'older';

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
  /**
   * The bundle claims to be a release of this collection by another publisher:
   * `own-collection` when this vault published it, `other-publisher` otherwise.
   */
  publisherWarning?: 'own-collection' | 'other-publisher' | undefined;
  /** A new collection whose name another collection already uses. */
  suggestedName?: string | undefined;
  counts: Record<ChangeStatus, number>;
  conflicts: ReviewUnit[];
  /** The vault already has this version and nothing differs that it would change or ask about. */
  upToDate: boolean;
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
  return { kind: 'File', name: baseName(key.slice(key.indexOf(':') + 1)) };
}

function relationOf(version: number, installedVersion: number | undefined): ImportRelation {
  if (installedVersion === undefined) return 'new';
  if (version > installedVersion) return 'newer';
  return version === installedVersion ? 'same' : 'older';
}

function publisherWarning(manifest: CollectionBundleManifest, existing: CollectionMetadata | null, vaultId: string): ImportReview['publisherWarning'] {
  const claimed = manifest.collection.publisherId;
  if (!existing?.publisherId || !claimed || claimed === existing.publisherId || manifest.release?.kind === 'share') return undefined;
  return existing.publisherId === vaultId ? 'own-collection' : 'other-publisher';
}

export function buildReview(
  manifest: CollectionBundleManifest,
  vaultId: string,
  existing: CollectionMetadata | null,
  record: InstallRecord | null,
  plan: ImportPlan,
  restorePlan: ImportPlan,
  unitAssets: ReadonlyMap<string, Asset>,
  suggestedName: string | undefined,
): ImportReview {
  const { collection } = manifest;
  const installedVersion = existing ? record?.version ?? existing.version : undefined;
  const conflicts = plan.units.flatMap((unit): ReviewUnit[] =>
    unit.conflict ? [{ key: unit.key, ...describeUnit(unit.key, unitAssets), reason: unit.conflict }] : []);
  const relation = relationOf(collection.version, installedVersion);
  return {
    collectionName: collection.name,
    localName: existing?.name,
    author: collection.author,
    version: collection.version,
    installedVersion,
    relation,
    kind: manifest.release?.kind ?? 'release',
    releaseNotes: manifest.release?.notes,
    exportedAt: manifest.exportedAt,
    hasInstallRecord: record !== null,
    publisherWarning: publisherWarning(manifest, existing, vaultId),
    suggestedName,
    counts: plan.counts,
    conflicts,
    upToDate: relation === 'same' && conflicts.length === 0 && !planHasChanges(plan),
    canRestore: existing !== null && restorePlan.counts.restored > 0,
    assetCount: manifest.assets.length,
    fileCount: manifest.files.length,
  };
}
