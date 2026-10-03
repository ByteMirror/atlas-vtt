import { beforeEach, describe, expect, it, vi } from 'vitest';

const artwork = vi.hoisted(() => ({
  ready: true,
  redraw: vi.fn(),
  load: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('../../../src/app/dice3d/dieArtwork', () => ({
  buildTextures: (): unknown => ({ map: null, bumpMap: null, redraw: artwork.redraw }),
  diceArtworkReady: (): boolean => artwork.ready,
  loadDiceArtwork: artwork.load,
}));

import { dieAssets } from '../../../src/app/dice3d/dieMesh';

describe('die face repaints', () => {
  beforeEach(() => {
    artwork.redraw.mockClear();
    artwork.load.mockClear();
  });

  it('paints faces once when their artwork is already there', async () => {
    artwork.ready = true;
    dieAssets(8);
    await Promise.resolve();
    expect(artwork.load).not.toHaveBeenCalled();
    expect(artwork.redraw).not.toHaveBeenCalled();
  });

  it('paints faces once more when their artwork arrives after them', async () => {
    artwork.ready = false;
    dieAssets(12);
    await artwork.load.mock.results[0]?.value;
    await Promise.resolve();
    expect(artwork.redraw).toHaveBeenCalledTimes(1);
  });
});
