import { describe, expect, it } from 'vitest';
import { canInteractWithFog, resolveFogPreviewAlpha } from '../../src/app/pixi/fog/fogVisibilityPolicy';

describe('fog visibility policy', () => {
  it('keeps fog fully opaque in player views regardless of GM mode flag', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: true, isGMView: true })).toBe(1);
    expect(resolveFogPreviewAlpha({ isPlayerView: true, isGMView: false })).toBe(1);
  });

  it('keeps DM view semi-transparent while in GM mode', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true })).toBe(0.5);
  });

  it('keeps non-GM DM/player-mode views fully opaque', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: false, isGMView: false })).toBe(1);
  });

  it('disables fog interaction in player views', () => {
    expect(canInteractWithFog({ isPlayerView: true })).toBe(false);
    expect(canInteractWithFog({ isPlayerView: false })).toBe(true);
  });
});
