import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

const scenes = vi.hoisted(() => ({ createScene: vi.fn() }));
const files = vi.hoisted(() => ({ writeAssetFile: vi.fn(), writeAssetImage: vi.fn(), discardAssetFiles: vi.fn() }));
const images = vi.hoisted(() => ({ optimizeUpload: vi.fn() }));
const stills = vi.hoisted(() => ({ mapFileThumbnail: vi.fn() }));
const thumbnails = vi.hoisted(() => ({ saveThumbnail: vi.fn() }));

vi.mock('../../src/app/services/sceneCreation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/services/sceneCreation')>()),
  createScene: scenes.createScene,
}));
vi.mock('../../src/app/services/assetImageFiles', () => files);
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => images);
vi.mock('../../src/app/packages/components/asset-manager/utils/mapFileThumbnail', () => stills);
// jsdom decodes neither video nor canvas, so the still itself is taken on trust here.
vi.mock('../../src/app/services/MapThumbnailService', () => ({
  MapThumbnailService: class { saveThumbnail = thumbnails.saveThumbnail; },
}));

import { importDroppedMaps } from '../../src/app/packages/components/asset-manager/utils/importDroppedMaps';
import type { AssetService } from '../../src/app/services/AssetService';

/** Vault paths that exist; everything else resolves to null. */
let existing: Set<string>;
const trashFile = vi.fn();

function fakeApp(): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => (existing.has(path) ? Object.assign(new TFile(), { path }) : null),
    },
    fileManager: { trashFile },
  } as unknown as App;
}

type App = import('obsidian').App;

/** jsdom's Blob has no `arrayBuffer`, which is all the importer reads a dropped file with. */
function withBytes<T extends object>(value: T): T {
  return Object.assign(value, { arrayBuffer: async () => new ArrayBuffer(8) });
}

function drop(...named: string[]): FileList {
  return named.map((name) => withBytes(new File(['map-bytes'], name))) as unknown as FileList;
}

function run(fileList: FileList): Promise<number> {
  return importDroppedMaps({
    app: fakeApp(),
    assetService: {} as AssetService,
    collectionId: 'campaign',
    files: fileList,
  });
}

describe('importDroppedMaps', () => {
  beforeEach(() => {
    existing = new Set();
    trashFile.mockReset().mockResolvedValue(undefined);
    files.discardAssetFiles.mockReset().mockResolvedValue(undefined);
    scenes.createScene.mockReset().mockResolvedValue(
      Object.assign(new TFile(), { path: 'atlas-vtt/collections/campaign/scenes/Cavern.atlasmap' })
    );
    files.writeAssetFile.mockReset().mockResolvedValue('atlas-vtt/assets/Cavern_1.webm');
    files.writeAssetImage.mockReset().mockResolvedValue('atlas-vtt/assets/Cavern_1.webp');
    images.optimizeUpload.mockReset().mockResolvedValue({ image: withBytes(new Blob(['converted'])) });
    stills.mapFileThumbnail.mockReset().mockResolvedValue(new ArrayBuffer(16));
    thumbnails.saveThumbnail.mockReset().mockResolvedValue(undefined);
  });

  it('keeps an animated map in its own format, which the image workers cannot decode', async () => {
    expect(await run(drop('Cavern.webm'))).toBe(1);

    expect(images.optimizeUpload).not.toHaveBeenCalled();
    expect(files.writeAssetFile).toHaveBeenCalledWith(expect.anything(), 'Cavern', 'webm', expect.any(ArrayBuffer));
    expect(scenes.createScene).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cavern',
      collectionId: 'campaign',
      backgroundPath: 'atlas-vtt/assets/Cavern_1.webm',
    }));
  });

  it('converts a dropped image through the shared map pipeline', async () => {
    expect(await run(drop('Cavern.PNG'))).toBe(1);

    expect(images.optimizeUpload).toHaveBeenCalledWith(expect.anything(), 'map', { thumbnail: false });
    expect(files.writeAssetImage).toHaveBeenCalled();
    expect(files.writeAssetFile).not.toHaveBeenCalled();
  });

  it('refuses a file that is neither image nor video, and imports the rest of the drop', async () => {
    expect(await run(drop('notes.pdf', 'Cavern.webm'))).toBe(1);

    expect(scenes.createScene).toHaveBeenCalledTimes(1);
    expect(files.writeAssetFile).toHaveBeenCalledTimes(1);
  });

  it('numbers a map whose scene name is taken rather than failing on it', async () => {
    existing.add('atlas-vtt/collections/campaign/scenes/Cavern.atlasmap');
    existing.add('atlas-vtt/collections/campaign/scenes/Cavern 1.atlasmap');

    await run(drop('Cavern.webm'));

    expect(scenes.createScene).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cavern 2' }));
  });

  it('gives the new scene a card image at once, from the dropped file', async () => {
    await run(drop('Cavern.webm'));

    expect(stills.mapFileThumbnail).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cavern.webm' }), true);
    expect(thumbnails.saveThumbnail).toHaveBeenCalledWith(
      'atlas-vtt/collections/campaign/scenes/Cavern.atlasmap',
      expect.any(ArrayBuffer)
    );
  });

  it('takes the still as an image when the map is not animated', async () => {
    await run(drop('Cavern.PNG'));

    expect(stills.mapFileThumbnail).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('still imports the map when no still could be taken of it', async () => {
    stills.mapFileThumbnail.mockResolvedValue(null);

    expect(await run(drop('Cavern.webm'))).toBe(1);

    expect(thumbnails.saveThumbnail).not.toHaveBeenCalled();
  });

  it('keeps the map when its thumbnail cannot be written', async () => {
    thumbnails.saveThumbnail.mockRejectedValue(new Error('the data folder is read-only'));

    expect(await run(drop('Cavern.webm'))).toBe(1);

    expect(files.discardAssetFiles).not.toHaveBeenCalled();
  });

  it('does not try to thumbnail a map whose scene was never written', async () => {
    scenes.createScene.mockRejectedValue(new Error('collection is gone'));

    await run(drop('Cavern.webm'));

    expect(stills.mapFileThumbnail).not.toHaveBeenCalled();
  });

  it('does not leave the map behind when its scene could not be written', async () => {
    existing.add('atlas-vtt/assets/Cavern_1.webm');
    scenes.createScene.mockRejectedValue(new Error('collection is gone'));

    expect(await run(drop('Cavern.webm'))).toBe(0);

    expect(files.discardAssetFiles).toHaveBeenCalledWith(expect.anything(), ['atlas-vtt/assets/Cavern_1.webm']);
  });

  it('has nothing to discard when the map itself could not be written', async () => {
    files.writeAssetFile.mockRejectedValue(new Error('the vault is read-only'));

    expect(await run(drop('Cavern.webm'))).toBe(0);

    expect(files.discardAssetFiles).toHaveBeenCalledWith(expect.anything(), [undefined]);
  });
});
