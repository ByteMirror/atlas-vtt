import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => { (AssetService as any).instance = null; });

async function setup() {
  const { app, files } = createInMemoryApp({ files: { 'goblin.webp': '', 'orc.webp': '' } });
  const service = AssetService.getInstance(app as any);
  await service.initialize();
  const goblin = await service.addTokenAsset({ name: 'Goblin', imagePath: 'goblin.webp', collection: 'default', tags: [] });
  const orc = await service.addTokenAsset({ name: 'Orc', imagePath: 'orc.webp', collection: 'default', tags: [] });
  const ref = (t: typeof goblin) => ({ id: t.id, name: t.name, imagePath: t.imagePath, size: 1 });
  const mixed = await service.createEncounter({ name: 'Mixed', tags: [], tokens: [ref(goblin), ref(orc)], data: {} });
  const solo = await service.createEncounter({ name: 'Solo', tags: [], tokens: [ref(goblin)], data: {} });
  return { service, files, goblin, orc, mixed, solo };
}

it('lists the encounters that use a token', async () => {
  const { service, goblin, orc, mixed, solo } = await setup();
  expect((await service.getGroupsUsingTokens([goblin.id])).map((g) => g.id).sort()).toEqual([mixed.id, solo.id].sort());
  expect((await service.getGroupsUsingTokens([orc.id])).map((g) => g.id)).toEqual([mixed.id]);
});

it('removes a deleted token from encounters and deletes encounters left empty', async () => {
  const { service, files, goblin, orc, mixed, solo } = await setup();
  await service.deleteAsset(goblin.id);

  const remaining = await service.getAssetById(mixed.id);
  expect(remaining?.type === 'encounter' && remaining.tokens.map((t) => t.id)).toEqual([orc.id]);
  expect(await service.getAssetById(solo.id)).toBeNull();
  expect(files.has(`atlas-vtt/collections/default/encounters/${solo.id}.json`)).toBe(false);
});

it('keeps empty encounters the deleted token was never part of', async () => {
  const { service, orc } = await setup();
  const empty = await service.createEncounter({ name: 'Empty', tags: [], tokens: [], data: {} });
  await service.deleteAsset(orc.id);
  expect(await service.getAssetById(empty.id)).not.toBeNull();
});
