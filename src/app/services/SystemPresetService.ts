import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { parseUserPreset, parseUserPresets } from '../gameSystems/presetValidation';
import type { SystemPreset, SystemRules } from '../types/systemPresetTypes';
import type { SettingsService } from './SettingsService';

type StoredPreset = Record<string, unknown>;

/**
 * The game system presets of this vault: the built-in ones plus those the user
 * saved, which live in Atlas' settings file and can be applied to any collection.
 *
 * Edits change only the fields they own, so data a newer Atlas added to a
 * stored preset survives an older one editing it.
 */
export class SystemPresetService {
  constructor(private readonly settings: Pick<SettingsService, 'getSetting' | 'setSetting' | 'onChange'>) {}

  /** Built-in presets first, then the user's in alphabetical order. */
  list(): SystemPreset[] {
    const userPresets = parseUserPresets(this.stored()).sort((a, b) => a.name.localeCompare(b.name));
    return [...BUILT_IN_SYSTEM_PRESETS, ...userPresets];
  }

  /** Why `name` cannot name a preset, or null when it can. `exceptId` is the preset being renamed. */
  nameError(name: string, exceptId?: string): string | null {
    const key = name.trim().toLowerCase();
    if (!key) return 'Enter a name';
    const taken = this.list().some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === key);
    return taken ? 'A preset with this name already exists' : null;
  }

  create(name: string, rules: SystemRules): SystemPreset {
    this.assertName(name);
    const preset: SystemPreset = { id: crypto.randomUUID(), name: name.trim(), builtIn: false, rules: structuredClone(rules) };
    this.write([...this.stored(), preset]);
    return preset;
  }

  update(id: string, rules: SystemRules): void {
    this.modify(id, (stored) => ({ ...stored, rules: { ...asRecord(stored.rules), ...structuredClone(rules) } }));
  }

  rename(id: string, name: string): void {
    this.assertName(name, id);
    this.modify(id, (stored) => ({ ...stored, name: name.trim() }));
  }

  /** Collections set from the preset keep their rules. */
  delete(id: string): void {
    this.write(this.stored().filter((stored) => !isEditable(stored, id)));
  }

  /** Calls `listener` whenever Atlas' settings change, which includes the presets. */
  onChange(listener: () => void): () => void {
    return this.settings.onChange(() => listener());
  }

  private stored(): unknown[] {
    const stored = this.settings.getSetting('systemPresets');
    return Array.isArray(stored) ? stored : [];
  }

  private modify(id: string, change: (stored: StoredPreset) => StoredPreset): void {
    const stored = this.stored();
    if (!stored.some((entry) => isEditable(entry, id))) throw new Error(`No editable preset with id ${id}`);
    this.write(stored.map((entry) => (isEditable(entry, id) ? change(entry) : entry)));
  }

  private assertName(name: string, exceptId?: string): void {
    const error = this.nameError(name, exceptId);
    if (error) throw new Error(error);
  }

  private write(stored: unknown[]): void {
    this.settings.setSetting('systemPresets', stored);
  }
}

function asRecord(value: unknown): StoredPreset {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as StoredPreset) : {};
}

/** Whether `entry` is the usable user preset `id`. */
function isEditable(entry: unknown, id: string): entry is StoredPreset {
  return parseUserPreset(entry)?.id === id;
}
