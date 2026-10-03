import { collectionResources } from '../../../resources/collectionResources';
import { keepingPlayerVisibility, withFinalKeys } from '../../../resources/resourceDefinitions';
import { withChangedBars } from '../../../resources/sceneVisibility';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { useEffect, useRef, useState } from 'react';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import { parseInitiativeRules, savedInitiativeRules } from '../../../gameSystems/initiativeRules';
import { parseLightPresets } from '../../../gameSystems/lightPresetValidation';
import { parseSenseDefinitions } from '../../../gameSystems/senseValidation';
import { DEFAULT_GRID_DEFAULTS, rulesOfPreset, vanillaSystemSettings } from '../../../gameSystems/systemRules';
import { parseCreatureFilters, parseHiddenCreatureFilters } from '../../../creatures/creatureFilterDefinitions';
import type { AssetService } from '../../../services/AssetService';
import type {
  CollectionGridDefaults,
  CollectionSettings,
  ConditionDefinition,
} from '../../../types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../../../types/creatureFilterTypes';
import type { DiceRules } from '../../../types/diceRulesTypes';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';
import type { LightPresetDefinition } from '../../../types/lightPresetTypes';
import type { SenseDefinition } from '../../../types/senseTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';

export interface CollectionSettingsDraft {
  gridDefaults: CollectionGridDefaults;
  setGridDefaults: (gridDefaults: CollectionGridDefaults) => void;
  defaultWidgets: Record<string, boolean>;
  setDefaultWidgets: (defaultWidgets: Record<string, boolean>) => void;
  /** What new tokens start with; undefined when the collection sets nothing. */
  defaultTokenVision: TokenVisionDefaults | undefined;
  setDefaultTokenVision: (vision: TokenVisionDefaults | undefined) => void;
  /** Unset while the collection takes the senses of its preset; read with `collectionSenses`. */
  senses: readonly SenseDefinition[] | undefined;
  /** Set only once the GM edits the senses (`editedSenses`), so an untouched collection keeps following its preset. */
  setSenses: (senses: readonly SenseDefinition[] | undefined) => void;
  /** The collection's own lights; unset while it takes those of its preset. Read with `collectionLightPresets`. */
  lightPresets: readonly LightPresetDefinition[] | undefined;
  conditions: ConditionDefinition[];
  setConditions: (conditions: ConditionDefinition[]) => void;
  resources: ResourceDefinition[];
  setResources: (resources: ResourceDefinition[]) => void;
  /** Unset while the collection takes the dice of its preset; read with `collectionDiceRules`. */
  dice: DiceRules | undefined;
  setDice: (dice: DiceRules) => void;
  /** Unset while the collection takes the initiative rules of its preset; read with `collectionInitiativeRules`. */
  initiative: InitiativeRules | undefined;
  setInitiative: (initiative: InitiativeRules | undefined) => void;
  /** The collection's filters on fields of its own. */
  customCreatureFilters: CreatureFilterDefinition[];
  setCustomCreatureFilters: (filters: CreatureFilterDefinition[]) => void;
  /** Ids of Atlas' own filters switched off for the collection. */
  hiddenCreatureFilters: string[];
  setHiddenCreatureFilters: (ids: string[]) => void;
  systemPresetId: string | undefined;
  setSystemPresetId: (presetId: string | undefined) => void;
  lootBases: string[];
  setLootBases: (lootBases: string[]) => void;
  lootCurrency: string;
  setLootCurrency: (lootCurrency: string) => void;
  applyPreset: (preset: SystemPreset) => void;
  /** Leaves the collection without a game system, as if it had never been set up. */
  clearSystem: () => void;
  /** The draft as the settings to save. */
  toSettings: () => Partial<CollectionSettings>;
}

/** Resources as they are stored: names and fields trimmed, and resources added in the dialog keyed by their name. */
export function savedResources(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  return withFinalKeys(resources.map((resource) => ({ ...resource, name: resource.name.trim(), field: resource.field.trim() })));
}

/** The collection's settings as edited in the modal; nothing is written until the caller saves. */
export function useCollectionSettingsDraft(
  assetService: AssetService | null,
  collectionId: string,
  isOpen: boolean,
): CollectionSettingsDraft {
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(() => structuredClone(DEFAULT_GRID_DEFAULTS));
  const [defaultWidgets, setDefaultWidgets] = useState<Record<string, boolean>>({});
  const [defaultTokenVision, setDefaultTokenVision] = useState<TokenVisionDefaults | undefined>(undefined);
  const [senses, setSenses] = useState<readonly SenseDefinition[] | undefined>(undefined);
  const [lightPresets, setLightPresets] = useState<readonly LightPresetDefinition[] | undefined>(undefined);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [resources, setResources] = useState<ResourceDefinition[]>([]);
  /** The resources the collection had when the draft opened; a bar switch follows only a resource that came or went. */
  const loadedResources = useRef<readonly ResourceDefinition[]>([]);
  const [dice, setDice] = useState<DiceRules | undefined>(undefined);
  const [initiative, setInitiative] = useState<InitiativeRules | undefined>(undefined);
  const [systemPresetId, setSystemPresetId] = useState<string | undefined>(undefined);
  const [lootBases, setLootBases] = useState<string[]>([]);
  const [lootCurrency, setLootCurrency] = useState('');
  const [customCreatureFilters, setCustomCreatureFilters] = useState<CreatureFilterDefinition[]>([]);
  const [hiddenCreatureFilters, setHiddenCreatureFilters] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen || !assetService) return;
    const settings = assetService.getCollectionSettings(collectionId);
    setGridDefaults(settings.gridDefaults ?? structuredClone(DEFAULT_GRID_DEFAULTS));
    setDefaultWidgets(settings.defaultWidgets ?? {});
    setDefaultTokenVision(settings.defaultTokenVision);
    setSenses(parseSenseDefinitions(settings.senses));
    // An empty list is no list of its own: the collection then reads its preset's.
    const ownLights = parseLightPresets(settings.lightPresets);
    setLightPresets(ownLights?.length ? ownLights : undefined);
    setConditions(settings.conditions ?? []);
    const loaded = collectionResources(settings);
    loadedResources.current = loaded;
    setResources(loaded);
    setDice(settings.dice);
    setInitiative(parseInitiativeRules(settings.initiative));
    setSystemPresetId(settings.systemPresetId);
    setLootBases(settings.lootBases ?? []);
    setLootCurrency(settings.lootCurrency ?? '');
    setCustomCreatureFilters(parseCreatureFilters(settings.customCreatureFilters));
    setHiddenCreatureFilters(parseHiddenCreatureFilters(settings.hiddenCreatureFilters));
  }, [isOpen, collectionId, assetService]);

  const applyPreset = (preset: SystemPreset): void => {
    const rules = rulesOfPreset(preset);
    setGridDefaults(rules.gridDefaults);
    setConditions(rules.conditions);
    setResources(keepingPlayerVisibility(rules.resources, resources));
    setDefaultWidgets(rules.defaultWidgets);
    setDice(rules.dice);
    setDefaultTokenVision(rules.defaultTokenVision);
    // The collection reads its preset's senses, light presets and initiative rules until they are edited.
    setSenses(undefined);
    setLightPresets(undefined);
    setInitiative(undefined);
    setSystemPresetId(preset.id);
  };

  const clearSystem = (): void => {
    const vanilla = vanillaSystemSettings();
    setGridDefaults(vanilla.gridDefaults);
    setConditions(vanilla.conditions);
    setResources(vanilla.resources);
    setDefaultWidgets(vanilla.defaultWidgets);
    setDice(vanilla.dice);
    setDefaultTokenVision(vanilla.defaultTokenVision);
    setSenses(vanilla.senses);
    setLightPresets(vanilla.lightPresets);
    setInitiative(vanilla.initiative);
    setSystemPresetId(undefined);
  };

  const toSettings = (): Partial<CollectionSettings> => {
    const saved = savedResources(resources);
    return {
      gridDefaults,
      defaultWidgets: withChangedBars(defaultWidgets, loadedResources.current, saved),
      defaultTokenVision: hasVisionDefaults(defaultTokenVision) ? defaultTokenVision : undefined,
      senses,
      lightPresets,
      conditions,
      resources: saved,
      ...(dice && { dice: { ...dice, defaultRoll: dice.defaultRoll.trim() } }),
      initiative: initiative && savedInitiativeRules(initiative),
      // Trimmed, with the field as label where none was typed.
      customCreatureFilters: parseCreatureFilters(customCreatureFilters),
      hiddenCreatureFilters,
      systemPresetId,
      lootBases,
      lootCurrency: lootCurrency.trim() || undefined,
    };
  };

  return {
    gridDefaults, setGridDefaults,
    defaultWidgets, setDefaultWidgets,
    defaultTokenVision, setDefaultTokenVision,
    senses, setSenses,
    lightPresets,
    conditions, setConditions,
    resources, setResources,
    dice, setDice,
    initiative, setInitiative,
    customCreatureFilters, setCustomCreatureFilters,
    hiddenCreatureFilters, setHiddenCreatureFilters,
    systemPresetId, setSystemPresetId,
    lootBases, setLootBases,
    lootCurrency, setLootCurrency,
    applyPreset, clearSystem, toSettings,
  };
}
