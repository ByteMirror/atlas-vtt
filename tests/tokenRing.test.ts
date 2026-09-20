import { describe, it, expect, beforeEach } from 'vitest';
import { atlasStore } from '../src/app/atlasStore';

/** Basic unit tests around token ring colour state */

describe('Token ring colour', () => {
  beforeEach(() => {
    // Reset store between tests
    atlasStore.setState({ ...atlasStore.getState(), objects: { ...atlasStore.getState().objects, tokens: {} } });
  });

  it('assigns ringColor to token via setTokenRing', () => {
    const id = atlasStore.getState().addToken({ x: 0, y: 0, imagePath: 'dummy.png' });
    atlasStore.getState().setTokenRing(id, '#ff0000');
    const token = atlasStore.getState().objects.tokens[id];
    expect(token.ringColor).toBe('#ff0000');
  });

  it('clears ringColor when null provided', () => {
    const id = atlasStore.getState().addToken({ x: 0, y: 0, imagePath: 'dummy.png', ringColor: '#00ff00' });
    atlasStore.getState().setTokenRing(id, null);
    const token = atlasStore.getState().objects.tokens[id];
    expect(token.ringColor).toBeUndefined();
  });
}); 