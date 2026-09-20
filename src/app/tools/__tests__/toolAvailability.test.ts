import { describe, it, expect } from 'vitest';
import { isAtlasToolAvailable } from '../toolAvailability';
import { AMBIENT_AUDIO_ENABLED, WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';

describe('isAtlasToolAvailable', () => {
  it('follows the release flag for the audio tool', () => {
    expect(isAtlasToolAvailable('audio')).toBe(AMBIENT_AUDIO_ENABLED);
  });

  it('follows the release flag for the wall & lighting tool', () => {
    expect(isAtlasToolAvailable('wall')).toBe(WALLS_AND_LIGHTING_ENABLED);
  });

  it('leaves shipped tools available', () => {
    for (const tool of ['move', 'select', 'fog', 'text', 'measure', 'note-pin', 'draw-pen']) {
      expect(isAtlasToolAvailable(tool)).toBe(true);
    }
  });
});
