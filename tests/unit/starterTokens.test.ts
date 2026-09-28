import { beforeEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { addStarterTokens, STARTER_TOKENS } from '../../src/app/services/starterTokens';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => AssetService.resetInstance());

async function setup(): Promise<{ vault: InMemoryApp; assets: AssetService; settings: SettingsService }> {
  const vault = createInMemoryApp();
  const settings = new SettingsService(vault.app);
  await settings.initialize();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets, settings };
}

it('adds every starter token to the default collection, tagged as a class', async () => {
  const { vault, assets, settings } = await setup();
  const collection = assets.getDefaultCollectionId();

  await addStarterTokens(vault.app, assets, settings);

  const tokens = await assets.getAssets(collection, 'token');
  expect(tokens.map((token) => token.name)).toEqual(STARTER_TOKENS.map((token) => token.name));
  for (const token of tokens) {
    expect(token.tags).toEqual(['Class']);
    expect(token.showRing).toBe(true);
    expect(vault.files.has(token.imagePath)).toBe(true);
  }
  expect((await assets.getCollectionTags(collection, 'tokens')).map((tag) => tag.name)).toEqual(['Class']);
  expect(vault.app.workspace.trigger).toHaveBeenCalledWith('atlas-vtt:refresh-assets');
});

it('follows the default collection when it was renamed', async () => {
  const { vault, assets, settings } = await setup();
  await assets.renameCollection(assets.getDefaultCollectionId(), 'Party');

  await addStarterTokens(vault.app, assets, settings);

  expect(await assets.getAssets('Party', 'token')).toHaveLength(STARTER_TOKENS.length);
});

it('does not count the starter tokens as the user importing a token', async () => {
  const { vault, assets, settings } = await setup();

  await addStarterTokens(vault.app, assets, settings);

  expect(settings.getSetting('onboarding').tokenImported).toBe(false);
});

it('adds the starter tokens only once, so deleted ones stay deleted', async () => {
  const { vault, assets, settings } = await setup();
  const collection = assets.getDefaultCollectionId();
  await addStarterTokens(vault.app, assets, settings);
  const [first] = await assets.getAssets(collection, 'token');
  await assets.deleteAsset(first!.id);

  await addStarterTokens(vault.app, assets, settings);

  expect(settings.getSetting('starterTokensAdded')).toBe(true);
  expect(await assets.getAssets(collection, 'token')).toHaveLength(STARTER_TOKENS.length - 1);
});
