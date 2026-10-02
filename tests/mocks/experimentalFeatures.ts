import type { App } from 'obsidian';
import { vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';

/**
 * An app whose GM switched dynamic lighting on. The answer is given directly: a real
 * `setExperimental` schedules a save, which first reads the vault's settings file.
 */
export function withDynamicLighting<T>(app: T): T {
  const settings = SettingsService.forApp(app as App) ?? new SettingsService(app as App);
  vi.spyOn(settings, 'isExperimentalOn').mockReturnValue(true);
  return app;
}
