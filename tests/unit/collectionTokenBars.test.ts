import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { applyTokenBars, changedTokenBars, tokenBarsOf, withTokenBars } from '../../src/app/services/collectionTokenBars';
import { DEFAULT_TOKEN_SETTINGS } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

describe('token bars of a collection', () => {
  it('reads the bars from the default widgets and leaves unconfigured collections alone', () => {
    expect(tokenBarsOf(undefined)).toEqual({});
    expect(tokenBarsOf({})).toEqual({ showHPBars: false, showStressBars: false });
    expect(tokenBarsOf({ hpBar: true, stressBar: true })).toEqual({ showHPBars: true, showStressBars: true });
  });

  it('reports only the bars that changed', () => {
    expect(changedTokenBars({}, { showHPBars: true, showStressBars: false })).toEqual({ showHPBars: true, showStressBars: false });
    expect(changedTokenBars({ showHPBars: true, showStressBars: false }, { showHPBars: true, showStressBars: true }))
      .toEqual({ showStressBars: true });
  });

  it('always writes complete token settings, since a map file replaces the defaults as a whole', () => {
    expect(withTokenBars({ showNameplates: true }, { showStressBars: true }))
      .toEqual({ ...DEFAULT_TOKEN_SETTINGS, showNameplates: true, showStressBars: true });
  });
});

describe('applyTokenBars', () => {
  it('turns the bars on in every closed scene of the collection, keeping its other token settings', async () => {
    const scene = 'atlas-vtt/collections/umbra/scenes/Keep.atlasmap';
    const other = 'atlas-vtt/collections/other/scenes/Inn.atlasmap';
    const map = (tokenSettings?: object): string => JSON.stringify({ version: 4, state: { objects: { tokens: {} }, ...(tokenSettings && { tokenSettings }) } });
    const { app, files } = createInMemoryApp({ files: { [scene]: map({ ...DEFAULT_TOKEN_SETTINGS, showNameplates: true }), [other]: map() } });
    app.workspace = { getLeavesOfType: () => [] } as any;
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollectionForMap: (path: string) => (path.includes('/umbra/') ? 'umbra' : 'other'),
    } as any);

    await applyTokenBars(app as any, 'umbra', { showStressBars: true });

    expect(JSON.parse(files.get(scene)!).state.tokenSettings).toMatchObject({ showNameplates: true, showStressBars: true, showHPBars: true });
    expect(files.get(other)).toBe(map());
  });
});
