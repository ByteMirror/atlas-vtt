import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));

import { AssetService, type SceneAsset } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { renameScene } from '../../src/app/services/sceneRename';
import { rewriteMapReferences } from '../../src/app/services/renamedPaths';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const scenes = 'atlas-vtt/collections/default/scenes';
const mapFile = (pins: Record<string, unknown> = {}): string =>
  JSON.stringify({ version: 3, state: { objects: { tokens: {}, pins } } });

async function setup() {
  const state = createInMemoryApp({
    files: {
      [`${scenes}/Old Keep.atlasmap`]: mapFile(),
      [`${scenes}/Old Keep.thumb.jpg`]: 'jpeg',
      [`${scenes}/Overworld.atlasmap`]: mapFile({
        keep: { id: 'keep', kind: 'pin', x: 0, y: 0, notePath: `${scenes}/Old Keep.atlasmap#Gate` },
        note: { id: 'note', kind: 'pin', x: 0, y: 0, notePath: 'Notes/Tavern.md' },
      }),
    },
  });
  const assets = AssetService.getInstance(state.app);
  await assets.initialize();
  const scene = await assets.addAsset({
    type: 'scene', name: 'Old Keep', collection: 'default', tags: [], data: { mapPath: `${scenes}/Old Keep.atlasmap` },
  });
  const read = async (): Promise<SceneAsset> => (await assets.getAssetById(scene.id)) as SceneAsset;
  return { ...state, assets, scene, read };
}

beforeEach(() => Reflect.set(AssetService, 'instance', null));

describe('renaming a scene in the Asset Manager', () => {
  it('renames the map file with the scene, so tabs, pins and links see the new name', async () => {
    const { app, files, assets, scene, read } = await setup();

    expect(await renameScene(app, assets, scene.id, '  New Keep ')).toBe(true);

    expect(files.has(`${scenes}/New Keep.atlasmap`)).toBe(true);
    expect(files.has(`${scenes}/Old Keep.atlasmap`)).toBe(false);
    const renamed = await read();
    expect(renamed).toMatchObject({ name: 'New Keep', data: { mapPath: `${scenes}/New Keep.atlasmap` } });
    expect(JSON.parse(files.get(assets.getAssetFilePath(renamed))!)).toEqual({ mapPath: `${scenes}/New Keep.atlasmap` });
  });

  it('refuses names that are taken or that Obsidian cannot use as a file name', async () => {
    const { app, files, assets, scene, read } = await setup();

    expect(await renameScene(app, assets, scene.id, 'Overworld')).toBe(false);
    expect(await renameScene(app, assets, scene.id, 'Keep: West')).toBe(false);

    expect(files.has(`${scenes}/Old Keep.atlasmap`)).toBe(true);
    expect((await read()).name).toBe('Old Keep');
  });
});

describe('renaming a map file in the vault', () => {
  it('moves the scene record, its thumbnail and pins in other maps to the new path', async () => {
    const { app, files, read } = await setup();
    await app.vault.rename(app.vault.getFileByPath(`${scenes}/Old Keep.atlasmap`)!, `${scenes}/New Keep.atlasmap`);

    await new FileReferenceService(app).handleFileRenamed(`${scenes}/Old Keep.atlasmap`, `${scenes}/New Keep.atlasmap`);

    expect(await read()).toMatchObject({ name: 'New Keep', data: { mapPath: `${scenes}/New Keep.atlasmap` } });
    expect(files.has(`${scenes}/New Keep.thumb.jpg`)).toBe(true);
    const pins = JSON.parse(files.get(`${scenes}/Overworld.atlasmap`)!).state.objects.pins;
    expect(pins.keep.notePath).toBe(`${scenes}/New Keep.atlasmap#Gate`);
    expect(pins.note.notePath).toBe('Notes/Tavern.md');
  });

  it('keeps a scene name the user chose instead of the file name', async () => {
    const { app, assets, scene, read } = await setup();
    await assets.updateAsset(scene.id, { name: 'The Keep at Dawn' });

    await new FileReferenceService(app).handleFileRenamed(`${scenes}/Old Keep.atlasmap`, `${scenes}/New Keep.atlasmap`);

    expect((await read()).name).toBe('The Keep at Dawn');
  });
});

describe('rewriteMapReferences', () => {
  it('retargets token art, token statblocks and pin targets, leaving other paths alone', () => {
    const objects = {
      tokens: {
        a: { imagePath: 'Art/goblin.webp', statblockPath: 'Bestiary/Goblin.md' },
        b: { imagePath: 'Art/orc.webp' },
      },
      pins: { p: { notePath: 'Bestiary/Goblin.md#Tactics' } },
    };

    expect(rewriteMapReferences(objects, 'Bestiary/Goblin.md', 'Bestiary/Goblin Boss.md')).toBe(true);
    expect(objects.tokens.a.statblockPath).toBe('Bestiary/Goblin Boss.md');
    expect(objects.pins.p.notePath).toBe('Bestiary/Goblin Boss.md#Tactics');
    expect(objects.tokens.b.imagePath).toBe('Art/orc.webp');
    expect(rewriteMapReferences(objects, 'Nowhere.md', 'Elsewhere.md')).toBe(false);
  });
});
