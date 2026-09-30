import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

const scenes = vi.hoisted(() => ({ createScene: vi.fn() }));
const files = vi.hoisted(() => ({ writeAssetFile: vi.fn(), writeAssetImage: vi.fn() }));
const images = vi.hoisted(() => ({ optimizeUpload: vi.fn() }));

vi.mock('../../src/app/services/sceneCreation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/services/sceneCreation')>()),
  createScene: scenes.createScene,
}));
vi.mock('../../src/app/services/assetImageFiles', () => files);
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => images);

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
    scenes.createScene.mockReset().mockResolvedValue(new TFile());
    files.writeAssetFile.mockReset().mockResolvedValue('atlas-vtt/assets/Cavern_1.webm');
    files.writeAssetImage.mockReset().mockResolvedValue('atlas-vtt/assets/Cavern_1.webp');
    images.optimizeUpload.mockReset().mockResolvedValue({ image: withBytes(new Blob(['converted'])) });
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

  it('does not leave the map behind when its scene could not be written', async () => {
    existing.add('atlas-vtt/assets/Cavern_1.webm');
    scenes.createScene.mockRejectedValue(new Error('collection is gone'));

    expect(await run(drop('Cavern.webm'))).toBe(0);

    expect(trashFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'atlas-vtt/assets/Cavern_1.webm' }));
  });
});
