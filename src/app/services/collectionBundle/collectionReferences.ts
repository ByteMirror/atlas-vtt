import { TFile, type App } from 'obsidian';
import type { Asset, AssetService, GroupTokenRef } from '../AssetService';
import { isPersistedMapEnvelope } from '../MapPersistence';
import { isRecord } from '../assetMetadataGuards';
import { imageReference, localImage } from '../statblockImportCandidates';
import type { BundleFile, BundleFileRole, StatblockImageKey } from './bundleFormat';

/** The scene thumbnail lives next to its map file. */
export const sceneThumbnailPath = (mapPath: string): string => mapPath.replace(/\.atlasmap$/, '.thumb.jpg');

/**
 * Lists every vault file a collection depends on, so a bundle can carry the
 * whole collection: asset records and images, scene maps with their
 * backgrounds and the artwork of tokens placed on them, and the statblock
 * notes tokens link to together with their artwork. Missing files are
 * skipped; the first role claimed for a path wins.
 */
export class CollectionReferenceCollector {
  private readonly files = new Map<string, BundleFile>();
  private readonly statblockNotes = new Set<string>();

  constructor(private readonly app: App, private readonly assets: AssetService) {}

  async collect(assets: readonly Asset[]): Promise<BundleFile[]> {
    for (const asset of assets) await this.collectAsset(asset);
    for (const notePath of this.statblockNotes) this.collectStatblockImage(notePath);
    return [...this.files.values()];
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
      return;
    }
    if (!isPersistedMapEnvelope(envelope) || !envelope.state) return;
    this.add(envelope.state.background ?? undefined, 'background');
    for (const token of Object.values(envelope.state.objects?.tokens ?? {})) {
      this.add(token.imagePath, 'token-image');
      if (token.kind === 'character') this.addStatblockNote(token.statblockPath);
    }
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
    this.add(image.path, 'statblock-image');
    entry.statblockImage = { key, path: image.path };
  }

  private add(path: string | undefined, role: BundleFileRole): boolean {
    if (!path || this.files.has(path)) return false;
    if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) return false;
    this.files.set(path, { vaultPath: path, role });
    return true;
  }
}
