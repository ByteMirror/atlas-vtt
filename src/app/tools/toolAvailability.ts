import { AMBIENT_AUDIO_ENABLED } from '../featureFlags';

/**
 * Central release gate for tool availability.
 *
 * The ambient sound tool is withheld from the release.
 *
 * This gates `setActiveTool` in the store, so it covers keyboard shortcuts as
 * well as the toolbar button.
 */
export function isAtlasToolAvailable(tool: string): boolean {
  if (tool === 'audio') return AMBIENT_AUDIO_ENABLED;
  return true;
}
