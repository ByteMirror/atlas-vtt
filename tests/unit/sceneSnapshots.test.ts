import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { SceneSnapshotService, nextSnapshotName } from '../../src/app/snapshots/SceneSnapshotService';
import { createSnapshot, isSceneSnapshot, restoreSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { snapshotFolderFor } from '../../src/app/snapshots/snapshotPaths';
import { moveSceneSnapshots, trashSceneSnapshots } from '../../src/app/snapshots/snapshotFolderSync';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { isHiddenVaultPath } from '../../src/app/utils/hiddenVaultFiles';
import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const SCENES = 'atlas-vtt/collections/c/scenes';
const FOLDER = `${SCENES}/.snapshots/Cave`;

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

  it('keeps snapshots in a hidden folder beside the map file', () => {
    expect(snapshotFolderFor(MAP_PATH)).toBe(FOLDER);
    expect(snapshotFolderFor('Cave.atlasmap')).toBe('.snapshots/Cave');
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
    expect(entries[1]?.path).toBe(`${FOLDER}/${first.id}.json`);
    expect(entries[1]?.thumbnailPath).toBe(`${FOLDER}/${first.id}.jpg`);
    expect(entries[0]?.thumbnailPath).toBeNull();
    expect(vault.files.get(`${FOLDER}/${first.id}.jpg`)).toBe('JPG');
  });

  it('never creates files or folders the vault indexes', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', new TextEncoder().encode('JPG').buffer);

    const created = [...vault.files.keys(), ...vault.folders].filter((path) => path.includes('snapshot'));
    expect(created.length).toBeGreaterThan(0);
    expect(created.every(isHiddenVaultPath)).toBe(true);
    expect(vault.folders.has(`${SCENES}/Cave.snapshots`)).toBe(false);
  });

  it('builds thumbnail URLs that change when the snapshot is overwritten', async () => {
    const { snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', new TextEncoder().encode('JPG').buffer);
    const [entry] = await snapshots.list(MAP_PATH);
    const before = snapshots.thumbnailUrl(entry!);
    expect(before).toMatch(new RegExp(`^app://local/${FOLDER}/.*\\.jpg\\?v=\\d+$`));

    await new Promise((resolve) => setTimeout(resolve, 2));
    await snapshots.overwrite(entry!, mapFile, new TextEncoder().encode('NEW').buffer);
    const [overwritten] = await snapshots.list(MAP_PATH);
    expect(snapshots.thumbnailUrl(overwritten!)).not.toBe(before);
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

  it('overwrites a snapshot with the current map, keeping its id, name and place', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const original = await snapshots.create(mapFile, 'Ambush', new TextEncoder().encode('OLD').buffer);
    const [entry] = await snapshots.list(MAP_PATH);

    vault.files.set(MAP_PATH, mapEnvelope({ ...encounterReady, objects: { tokens: { goblin: { id: 'goblin', x: 50, y: 60, imagePath: 'atlas-vtt/assets/goblin.webp', hp: 2 } } } }));
    await snapshots.overwrite(entry!, mapFile, new TextEncoder().encode('NEW').buffer);

    const [overwritten] = await snapshots.list(MAP_PATH);
    expect(overwritten?.snapshot).toMatchObject({ id: original.id, name: 'Ambush', createdAt: original.createdAt });
    expect(overwritten?.snapshot.updatedAt).toBeGreaterThanOrEqual(original.createdAt);
    expect(overwritten?.snapshot.state.objects?.tokens?.goblin).toMatchObject({ x: 50, y: 60, hp: 2 });
    expect(vault.files.get(`${FOLDER}/${original.id}.jpg`)).toBe('NEW');
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
    expect(vault.files.has(one!.thumbnailPath!)).toBe(false);

    await snapshots.delete(two!);
    expect(vault.folders.has(FOLDER)).toBe(false);
    expect(vault.folders.has(`${SCENES}/.snapshots`)).toBe(false);
    expect(vault.folders.has(SCENES)).toBe(true);
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
    const renamed = `${SCENES}/Goblin cave.atlasmap`;

    await moveSceneSnapshots(vault.app, MAP_PATH, renamed);
    expect(await snapshots.list(renamed)).toHaveLength(1);
    expect(vault.folders.has(FOLDER)).toBe(false);
  });

  it('moves the snapshots into the hidden folder of the map\'s new folder', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(mapFile, 'Ambush', null);
    const moved = 'atlas-vtt/collections/other/scenes/Cave.atlasmap';

    await moveSceneSnapshots(vault.app, MAP_PATH, moved);
    expect(await snapshots.list(moved)).toHaveLength(1);
    expect(vault.folders.has('atlas-vtt/collections/other/scenes/.snapshots/Cave')).toBe(true);
    expect(vault.folders.has(`${SCENES}/.snapshots`)).toBe(false);
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
