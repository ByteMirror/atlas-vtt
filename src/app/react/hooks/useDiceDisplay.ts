import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import type { DiceDisplay } from '../../dice3d/diceDisplay';
import { SettingsService } from '../../services/SettingsService';

/** How rolls are shown, kept current as the setting changes. */
export function useDiceDisplay(app: App | undefined): DiceDisplay {
  const settings = SettingsService.forApp(app);
  const [display, setDisplay] = useState<DiceDisplay>(() => settings?.getDiceDisplay() ?? 'full');

  useEffect(() => {
    if (!settings) return;
    setDisplay(settings.getDiceDisplay());
    return settings.onChange(() => setDisplay(settings.getDiceDisplay()));
  }, [settings]);

  return display;
}
