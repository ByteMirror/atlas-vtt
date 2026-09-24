import { TFile, type App } from 'obsidian';
import type { Asset, AssetService, GroupTokenRef } from '../AssetService';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../MapPersistence';
import { SceneSnapshotService } from '../../snapshots/SceneSnapshotService';
import { isRecord } from '../assetMetadataGuards';
import { imageReference, localImage } from '../statblockImportCandidates';
import type { BundleFile, BundleFileRole, StatblockImageKey } from './bundleFormat';

/** The scene thumbnail lives next to its map file. */
export const sceneThumbnailPath = (mapPath: string): string => mapPath.replace(/\.atlasmap$/, '.thumb.jpg');

/** The file a note link opens: `Notes/Cave.md#Entrance` opens `Notes/Cave.md`. */
export const linkedFilePath = (link: string): string => link.split('#', 1)[0]!;

/** A file the collection refers to that is no longer in the vault. */
export interface MissingReference {
  path: string;
  role: BundleFileRole;
  /** Name of the asset that refers to it. */
  assetName: string;
}

interface CollectedFiles {
  files: BundleFile[];
  missing: MissingReference[];
}

/** Previews are regenerated when missing, so their absence is not worth a warning. */
const OPTIONAL_ROLES = new Set<BundleFileRole>(['thumbnail', 'scene-thumbnail']);

/**
 * Lists every vault file a collection depends on, so a bundle can carry the
 * whole collection: asset records and images, scene maps and their snapshots
 * with the backgrounds and artwork of tokens placed on them, the notes their
 * pins and characters open, and the statblock notes tokens link to together
 * with their artwork. Every file lists the
 * assets that use it; the first role claimed for a path wins. Referenced
 * files that are gone are reported instead of packed.
 */
export class CollectionReferenceCollector {
  private readonly files = new Map<string, BundleFile>();
  private readonly statblockNotes = new Set<string>();
  private readonly missing = new Map<string, MissingReference>();
  private owner: Asset | null = null;

  constructor(private readonly app: App, private readonly assets: AssetService) {}

  async collect(assets: readonly Asset[]): Promise<CollectedFiles> {
    for (const asset of assets) {
      this.owner = asset;
      await this.collectAsset(asset);
    }
    this.owner = null;
    for (const notePath of this.statblockNotes) this.collectStatblockImage(notePath);
    return { files: [...this.files.values()], missing: [...this.missing.values()] };
  }

  private async collectAsset(asset: Asset): Promise<void> {
    this.add(this.assets.getAssetFilePath(asset), asset.type === 'token' ? 'token-image' : 'asset-file');
    switch (asset.type) {
      case 'token':
        this.add(asset.thumbnailPath, 'thumbnail');
        this.addStatblockNote(asset.statblockPath);
        break;
      case 'map':
        this.add(asset.mapFilePath, 'background');
        this.add(asset.thumbnailPath, 'thumbnail');
        break;
      case 'scene':
        await this.collectScene(asset.data?.mapPath ?? await this.readSceneMapPath(asset));
        break;
      case 'encounter':
      case 'player':
        this.collectTokenRefs(asset.tokens ?? asset.data?.tokens ?? []);
        break;
      default:
        break;
    }
  }

  private collectTokenRefs(refs: readonly GroupTokenRef[]): void {
    for (const ref of refs) {
      this.add(ref.imagePath, 'token-image');
      this.addStatblockNote(ref.statblockPath);
    }
  }

  /** Older scene records keep the map path only inside their JSON file. */
  private async readSceneMapPath(asset: Asset): Promise<string | undefined> {
    const file = this.app.vault.getAbstractFileByPath(this.assets.getAssetFilePath(asset));
    if (!(file instanceof TFile)) return undefined;
    try {
      const parsed: unknown = JSON.parse(await this.app.vault.read(file));
      return isRecord(parsed) && typeof parsed.mapPath === 'string' ? parsed.mapPath : undefined;
    } catch {
      return undefined;
    }
  }

  private async collectScene(mapPath: string | undefined): Promise<void> {
    if (!mapPath) return;
    const mapFile = this.app.vault.getAbstractFileByPath(mapPath);
    if (!(mapFile instanceof TFile)) return;
    this.add(mapPath, 'scene-map');
    this.add(sceneThumbnailPath(mapPath), 'scene-thumbnail');

    let envelope: unknown;
    try {
      envelope = JSON.parse(await this.app.vault.read(mapFile));
    } catch {
      envelope = null;
    }
    if (isPersistedMapEnvelope(envelope)) this.collectMapState(envelope);

    for (const { snapshot, path, thumbnailPath } of await new SceneSnapshotService(this.app).list(mapPath)) {
      this.addHidden(path, 'scene-snapshot');
      this.addHidden(thumbnailPath, 'scene-snapshot-thumbnail');
      this.collectMapState(snapshot);
    }
  }

  /** The background, token artwork, character statblocks and linked notes a saved map state shows. */
  private collectMapState({ state }: PersistedMapEnvelope): void {
    if (!state) return;
    this.add(state.background ?? undefined, 'background');
    for (const token of Object.values(state.objects?.tokens ?? {})) {
      this.add(token.imagePath, 'token-image');
      if (token.kind !== 'character') continue;
      this.addStatblockNote(token.statblockPath);
      this.addLinkedNote(token.notePath);
    }
    for (const pin of Object.values(state.objects?.pins ?? {})) this.addLinkedNote(pin.notePath);
  }

  private addLinkedNote(link: string | undefined): void {
    if (link) this.add(linkedFilePath(link), 'linked-note');
  }

  private addStatblockNote(path: string | undefined): void {
    if (path && this.add(path, 'statblock-note')) this.statblockNotes.add(path);
  }

  /** The artwork a statblock note's frontmatter points at, recorded on the note's entry for rewriting on import. */
  private collectStatblockImage(notePath: string): void {
    const note = this.app.vault.getAbstractFileByPath(notePath);
    const entry = this.files.get(notePath);
    if (!(note instanceof TFile) || !entry) return;
    const frontmatter: Record<string, unknown> = this.app.metadataCache.getFileCache(note)?.frontmatter ?? {};
    const key: StatblockImageKey = imageReference(frontmatter.image) ? 'image' : 'token-image';
    const reference = imageReference(frontmatter[key]);
    const image = reference ? localImage(this.app, reference, notePath) : null;
    if (!image) return;
    this.add(image.path, 'statblock-image', entry.owners);
    entry.statblockImage = { key, path: image.path };
  }

  /** Records a file in a hidden folder, which the vault index does not list; the caller already found it on disk. */
  private addHidden(path: string | null, role: BundleFileRole): void {
    if (path && !this.files.has(path)) this.files.set(path, { vaultPath: path, role, owners: this.owner ? [this.owner.id] : [] });
  }

  /** Records `path` for the current asset (or `owners`); returns whether it was newly added. */
  private add(path: string | undefined, role: BundleFileRole, owners: readonly string[] = this.owner ? [this.owner.id] : []): boolean {
    if (!path) return false;
    const existing = this.files.get(path);
    if (existing) {
      existing.owners = [...new Set([...(existing.owners ?? []), ...owners])];
      return false;
    }
    if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
      if (!OPTIONAL_ROLES.has(role) && this.owner && !this.missing.has(path)) {
        this.missing.set(path, { path, role, assetName: this.owner.name });
      }
      return false;
    }
    this.files.set(path, { vaultPath: path, role, owners: [...owners] });
    return true;
  }
}
