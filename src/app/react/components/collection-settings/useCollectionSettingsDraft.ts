import { useEffect, useState } from 'react';
import { DEFAULT_GRID_DEFAULTS, rulesOfPreset, vanillaSystemSettings } from '../../../gameSystems/systemRules';
import type { AssetService } from '../../../services/AssetService';
import type {
  CollectionGridDefaults,
  CollectionSettings,
  ConditionDefinition,
  VisionSettings,
} from '../../../types/collectionSettingsTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { changedTokenBars, tokenBarsOf, type TokenBars } from '../../../services/collectionTokenBars';

export interface CollectionSettingsDraft {
  gridDefaults: CollectionGridDefaults;
  setGridDefaults: (gridDefaults: CollectionGridDefaults) => void;
  defaultWidgets: Record<string, boolean>;
  setDefaultWidgets: (defaultWidgets: Record<string, boolean>) => void;
  conditions: ConditionDefinition[];
  setConditions: (conditions: ConditionDefinition[]) => void;
  vision: VisionSettings | undefined;
  setVision: (vision: VisionSettings | undefined) => void;
  systemPresetId: string | undefined;
  setSystemPresetId: (presetId: string | undefined) => void;
  applyPreset: (preset: SystemPreset) => void;
  /** Leaves the collection without a game system, as if it had never been set up. */
  clearSystem: () => void;
  /** The draft as the settings to save. */
  toSettings: () => Partial<CollectionSettings>;
  /** The resource bars saving turns on or off in every scene, when the draft changed them. */
  tokenBarChanges: () => TokenBars;
}

/** The collection's settings as edited in the modal; nothing is written until the caller saves. */
export function useCollectionSettingsDraft(
  assetService: AssetService | null,
  collectionId: string,
  isOpen: boolean,
): CollectionSettingsDraft {
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(() => structuredClone(DEFAULT_GRID_DEFAULTS));
  const [defaultWidgets, setDefaultWidgets] = useState<Record<string, boolean>>({});
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [vision, setVision] = useState<VisionSettings | undefined>(undefined);
  const [systemPresetId, setSystemPresetId] = useState<string | undefined>(undefined);
  const [loadedDefaultWidgets, setLoadedDefaultWidgets] = useState<Record<string, boolean> | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || !assetService) return;
    const settings = assetService.getCollectionSettings(collectionId);
    setGridDefaults(settings.gridDefaults ?? structuredClone(DEFAULT_GRID_DEFAULTS));
    setDefaultWidgets(settings.defaultWidgets ?? {});
    setConditions(settings.conditions ?? []);
    setVision(settings.vision);
    setSystemPresetId(settings.systemPresetId);
    setLoadedDefaultWidgets(settings.defaultWidgets);
  }, [isOpen, collectionId, assetService]);

  const applyPreset = (preset: SystemPreset): void => {
    const rules = rulesOfPreset(preset);
    setGridDefaults(rules.gridDefaults);
    setConditions(rules.conditions);
    setDefaultWidgets(rules.defaultWidgets);
    setSystemPresetId(preset.id);
  };

  const clearSystem = (): void => {
    const vanilla = vanillaSystemSettings();
    setGridDefaults(vanilla.gridDefaults);
    setConditions(vanilla.conditions);
    setDefaultWidgets(vanilla.defaultWidgets);
    setSystemPresetId(undefined);
  };

  const toSettings = (): Partial<CollectionSettings> => ({
    gridDefaults,
    defaultWidgets,
    conditions,
    systemPresetId,
    ...(vision !== undefined && { vision }),
  });

  return {
    gridDefaults, setGridDefaults,
    defaultWidgets, setDefaultWidgets,
    conditions, setConditions,
    vision, setVision,
    systemPresetId, setSystemPresetId,
    applyPreset, clearSystem, toSettings,
    tokenBarChanges: () => changedTokenBars(tokenBarsOf(loadedDefaultWidgets), tokenBarsOf(defaultWidgets)),
  };
}
