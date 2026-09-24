import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { SettingsService } from '../../services/SettingsService';
import { SystemPresetService } from '../../services/SystemPresetService';
import type { SystemPreset } from '../../types/systemPresetTypes';

interface SystemPresets {
  /** Null while Atlas' settings are unavailable. */
  service: SystemPresetService | null;
  presets: SystemPreset[];
}

/** The vault's game system presets, kept current as they are saved, renamed or deleted. */
export function useSystemPresets(app: App | undefined): SystemPresets {
  const service = useMemo(() => {
    const settings = SettingsService.forApp(app);
    return settings ? new SystemPresetService(settings) : null;
  }, [app]);
  const [presets, setPresets] = useState<SystemPreset[]>(() => service?.list() ?? []);

  useEffect(() => {
    if (!service) return;
    setPresets(service.list());
    return service.onChange(() => setPresets(service.list()));
  }, [service]);

  return { service, presets };
}
