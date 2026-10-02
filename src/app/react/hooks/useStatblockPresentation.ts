import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { SettingsService } from '../../services/SettingsService';
import {
  DEFAULT_STATBLOCK_PRESENTATION,
  type StatblockPresentation,
} from '../../services/statblockPresentation';

/**
 * How statblocks are laid out, following the setting as it changes so every open
 * statblock — hover previews, the DM screen, the link dialog — switches at once.
 */
export function useStatblockPresentation(app: App | undefined): StatblockPresentation {
  const [presentation, setPresentation] = useState<StatblockPresentation>(
    () => SettingsService.forApp(app)?.getStatblockPresentation() ?? DEFAULT_STATBLOCK_PRESENTATION,
  );

  useEffect(() => {
    const settings = SettingsService.forApp(app);
    if (!settings) return;

    setPresentation(settings.getStatblockPresentation());
    return settings.onChange(() => setPresentation(settings.getStatblockPresentation()));
  }, [app]);

  return presentation;
}
