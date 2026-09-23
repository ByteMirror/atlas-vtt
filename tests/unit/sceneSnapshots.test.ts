import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { SceneSnapshotService, nextSnapshotName } from '../../src/app/snapshots/SceneSnapshotService';
import { createSnapshot, isSceneSnapshot, restoreSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { isSnapshotFilePath, snapshotFolderFor } from '../../src/app/snapshots/snapshotPaths';
import { moveSceneSnapshots, trashSceneSnapshots } from '../../src/app/snapshots/snapshotFolderSync';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const FOLDER = 'atlas-vtt/collections/c/scenes/Cave.snapshots';

interface MapState {
  mapPath?: string;
  background?: string;
  camera?: { x: number; y: number; scale: number };
  diceLog?: string[];
  initiative?: { round: number };
  objects: { tokens: Record<string, { id: string; x: number; y: number; imagePath: string; hp?: number; conditions?: string[] }> };
}

function mapEnvelope(state: MapState): string {
  return JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, ...state } });
}

const encounterReady: MapState = {
  mapPath: MAP_PATH,
  background: 'atlas-vtt/assets/cave.webp',
  camera: { x: 1, y: 2, scale: 3 },
  diceLog: ['d20: 12'],
  initiative: { round: 1 },
  objects: { tokens: { goblin: { id: 'goblin', x: 10, y: 20, imagePath: 'atlas-vtt/assets/goblin.webp', hp: 7, conditions: ['poisoned'] } } },
};

function readMap(vault: InMemoryApp): MapState {
  return (JSON.parse(vault.files.get(MAP_PATH) ?? '{}') as { state: MapState }).state;
}

async function seed(): Promise<{ vault: InMemoryApp; snapshots: SceneSnapshotService; mapFile: TFile }> {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: mapEnvelope(encounterReady) } });
  return { vault, snapshots: new SceneSnapshotService(vault.app), mapFile: new TFile(MAP_PATH) };
}

describe('scene snapshot format', () => {
  it('stores the scene state without the map path, camera and dice log', () => {
    const snapshot = createSnapshot({ version: 4, state: { ...encounterReady } }, 's1', 'Ambush', 1000);
    expect(snapshot).toMatchObject({ id: 's1', name: 'Ambush', createdAt: 1000, version: 4 });
    expect(snapshot.state).not.toHaveProperty('mapPath');
    expect(snapshot.state).not.toHaveProperty('camera');
    expect(snapshot.state).not.toHaveProperty('diceLog');
    expect(snapshot.state).toMatchObject({ background: encounterReady.background, initiative: { round: 1 } });
    expect(isSceneSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
  });

  it('restores the scene state but keeps the session state of the map it is restored into', () => {
    const snapshot = createSnapshot({ version: 4, state: { ...encounterReady } }, 's1', 'Ambush', 1000);
    const played = { version: 4, state: { mapPath: 'old/path.atlasmap', camera: { x: 9, y: 9, scale: 1 }, diceLog: ['d6: 3'], objects: { tokens: {} } } };
    const restored = restoreSnapshot(played, snapshot, MAP_PATH);
    expect(restored.state).toMatchObject({
      mapPath: MAP_PATH,
      camera: { x: 9, y: 9, scale: 1 },
      diceLog: ['d6: 3'],
      initiative: { round: 1 },
      objects: encounterReady.objects,
    });
  });

  it('rejects files that are not snapshots', () => {
    expect(isSceneSnapshot({ version: 4, state: {} })).toBe(false);
    expect(isSceneSnapshot({ format: 1, id: 'a', name: 'b', createdAt: 1, state: { objects: 'broken' } })).toBe(false);
  });

  it('keeps snapshots in a folder next to the map file', () => {
    expect(snapshotFolderFor(MAP_PATH)).toBe(FOLDER);
    expect(isSnapshotFilePath(`${FOLDER}/abc.json`)).toBe(true);
    expect(isSnapshotFilePath(MAP_PATH)).toBe(false);
  });

  it('picks the first free default name', () => {
    expect(nextSnapshotName([])).toBe('Snapshot 1');
    expect(nextSnapshotName(['Snapshot 1', 'Boss fight'])).toBe('Snapshot 3');
    expect(nextSnapshotName(['Snapshot 2'])).toBe('Snapshot 3');
  });
});

describe('SceneSnapshotService', () => {
  it('saves snapshots with a thumbnail and lists them newest first', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const first = await snapshots.create(mapFile, 'Before the ambush', new TextEncoder().encode('JPG').buffer);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await snapshots.create(mapFile, 'After round one', null);

    const entries = await snapshots.list(MAP_PATH);
    expect(entries.map((entry) => entry.snapshot.name)).toEqual(['After round one', 'Before the ambush']);
    expect(entries[1]?.file.path).toBe(`${FOLDER}/${first.id}.json`);
    expect(entries[1]?.thumbnail?.path).toBe(`${FOLDER}/${first.id}.jpg`);
    expect(entries[0]?.thumbnail).toBeNull();
    expect(vault.files.get(`${FOLDER}/${first.id}.jpg`)).toBe('JPG');
  });

  it('restores tokens, conditions and hit points into the map file', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const snapshot = await snapshots.create(mapFile, 'Ambush', null);

    vault.files.set(MAP_PATH, mapEnvelope({ ...encounterReady, diceLog: ['d8: 5'], objects: { tokens: {} } }));
    await snapshots.restoreInto(mapFile, snapshot);

    const restored = readMap(vault);
    expect(restored.objects.tokens.goblin).toMatchObject({ hp: 7, conditions: ['poisoned'], x: 10, y: 20 });
    expect(restored.mapPath).toBe(MAP_PATH);
    expect(restored.diceLog).toEqual(['d8: 5']);
  });

  it('renames a snapshot without touching its state', async () => {
    const { snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Snapshot 1', null);
    const [entry] = await snapshots.list(MAP_PATH);
    await snapshots.rename(entry!, 'Boss fight');

    const [renamed] = await snapshots.list(MAP_PATH);
    expect(renamed?.snapshot).toMatchObject({ name: 'Boss fight', id: entry!.snapshot.id, state: entry!.snapshot.state });
  });

  it('deletes a snapshot with its thumbnail and removes the emptied folder', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'One', new TextEncoder().encode('JPG').buffer);
    await snapshots.create(mapFile, 'Two', null);
    const entries = await snapshots.list(MAP_PATH);
    const one = entries.find((entry) => entry.snapshot.name === 'One');
    const two = entries.find((entry) => entry.snapshot.name === 'Two');

    await snapshots.delete(one!);
    expect(await snapshots.list(MAP_PATH)).toHaveLength(1);
    expect(vault.files.has(one!.thumbnail!.path)).toBe(false);

    await snapshots.delete(two!);
    expect(vault.folders.has(FOLDER)).toBe(false);
  });

  it('skips files in the folder that are not snapshots', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Good', null);
    vault.files.set(`${FOLDER}/broken.json`, '{not json');
    expect((await snapshots.list(MAP_PATH)).map((entry) => entry.snapshot.name)).toEqual(['Good']);
  });
});

describe('snapshot folder sync', () => {
  it('moves the snapshots along with a renamed map', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', null);
    const renamed = 'atlas-vtt/collections/c/scenes/Goblin cave.atlasmap';

    await moveSceneSnapshots(vault.app, MAP_PATH, renamed);
    expect(await snapshots.list(renamed)).toHaveLength(1);
    expect(vault.folders.has(FOLDER)).toBe(false);
  });

  it('trashes the snapshots of a deleted map', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', null);

    await trashSceneSnapshots(vault.app, MAP_PATH);
    expect([...vault.files.keys()].some((path) => path.startsWith(FOLDER))).toBe(false);
  });
});

describe('renamed files', () => {
  afterEach(() => AssetService.resetInstance());

  it('point snapshot tokens at the renamed artwork', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', null);

    await new FileReferenceService(vault.app).handleFileRenamed('atlas-vtt/assets/goblin.webp', 'atlas-vtt/assets/goblin-boss.webp');

    const [entry] = await snapshots.list(MAP_PATH);
    expect(entry?.snapshot.name).toBe('Ambush');
    expect(entry?.snapshot.state.objects?.tokens?.goblin?.imagePath).toBe('atlas-vtt/assets/goblin-boss.webp');
  });
});
