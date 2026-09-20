import { AMBIENT_AUDIO_ENABLED, WALLS_AND_LIGHTING_ENABLED } from '../featureFlags';

/**
 * Central release gate for tool availability.
 *
 * The ambient sound and wall & lighting tools are withheld from the beta release.
 *
 * This gates `setActiveTool` in the store, so it covers keyboard shortcuts as
 * well as the toolbar button.
 */
export function isAtlasToolAvailable(tool: string): boolean {
  if (tool === 'audio') return AMBIENT_AUDIO_ENABLED;
  if (tool === 'wall') return WALLS_AND_LIGHTING_ENABLED;
  return true;
}
