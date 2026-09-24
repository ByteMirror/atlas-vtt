import type { AtlasSettings, SettingsService } from '../../src/app/services/SettingsService';

type SettingsAccess = Pick<SettingsService, 'getSetting' | 'setSetting' | 'onChange'>;

/** The settings accessors backed by memory; settings not given read as undefined. */
export function memorySettings(initial: Partial<AtlasSettings> = {}): SettingsAccess & { current: Partial<AtlasSettings> } {
  const current: Partial<AtlasSettings> = { ...initial };
  const listeners = new Set<(settings: AtlasSettings) => void>();
  return {
    current,
    getSetting: <K extends keyof AtlasSettings>(key: K): AtlasSettings[K] => current[key] as AtlasSettings[K],
    setSetting: <K extends keyof AtlasSettings>(key: K, value: AtlasSettings[K]): void => {
      current[key] = value;
      for (const listener of listeners) listener(current as AtlasSettings);
    },
    onChange: (listener: (settings: AtlasSettings) => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
