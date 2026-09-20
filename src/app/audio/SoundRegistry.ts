import { TFile, TFolder, type App } from 'obsidian';
import type { SoundMeta, SoundCategory } from '../types/audioTypes';

/** Built-in ambient sounds shipped with the plugin */
const BUILTIN_SOUNDS: SoundMeta[] = [
  { id: 'river',       name: 'River / Stream',    category: 'Nature',     path: '' },
  { id: 'rain',        name: 'Rain',              category: 'Nature',     path: '' },
  { id: 'wind',        name: 'Wind',              category: 'Nature',     path: '' },
  { id: 'birds',       name: 'Birds Chirping',    category: 'Nature',     path: '' },
  { id: 'thunder',     name: 'Thunder Storm',     category: 'Nature',     path: '' },
  { id: 'fire',        name: 'Fireplace',         category: 'Interior',   path: '' },
  { id: 'tavern',      name: 'Tavern Ambience',   category: 'Interior',   path: '' },
  { id: 'library',     name: 'Library',           category: 'Interior',   path: '' },
  { id: 'battle',      name: 'Distant Battle',    category: 'Action',     path: '' },
  { id: 'marketplace', name: 'Marketplace',       category: 'Action',     path: '' },
  { id: 'cave',        name: 'Cave Dripping',     category: 'Atmosphere', path: '' },
  { id: 'dungeon',     name: 'Dungeon Ambience',  category: 'Atmosphere', path: '' },
];

const CUSTOM_SOUND_FOLDER = '.atlas/sounds';
const SUPPORTED_EXTENSIONS = ['.ogg', '.mp3', '.wav'];

export class SoundRegistry {
  private sounds: Map<string, SoundMeta> = new Map();
  private pluginDir: string;
  private app: App;

  constructor(app: App, pluginDir: string) {
    this.app = app;
    this.pluginDir = pluginDir;
    this.registerBuiltins();
  }

  getPluginDir(): string {
    return this.pluginDir;
  }

  private registerBuiltins(): void {
    for (const sound of BUILTIN_SOUNDS) {
      const meta: SoundMeta = {
        ...sound,
        path: `${this.pluginDir}/assets/sounds/${sound.id}.ogg`,
      };
      this.sounds.set(meta.id, meta);
    }
  }

  /** Scan the vault's custom sound folder and register any found files */
  async scanCustomSounds(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(CUSTOM_SOUND_FOLDER);
    if (!(folder instanceof TFolder)) return;

    for (const file of folder.children) {
      if (!(file instanceof TFile)) continue;
      const ext = '.' + file.extension;
      if (!SUPPORTED_EXTENSIONS.includes(ext.toLowerCase())) continue;

      const id = `custom:${file.name}`;
      if (this.sounds.has(id)) continue;

      this.sounds.set(id, {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        category: 'Custom',
        path: file.path,
      });
    }
  }

  getSound(id: string): SoundMeta | undefined {
    return this.sounds.get(id);
  }

  getAllSounds(): SoundMeta[] {
    return Array.from(this.sounds.values());
  }

  listByCategory(): Record<SoundCategory, SoundMeta[]> {
    const result: Record<SoundCategory, SoundMeta[]> = {
      Nature: [],
      Interior: [],
      Action: [],
      Atmosphere: [],
      Custom: [],
    };

    for (const sound of this.sounds.values()) {
      result[sound.category].push(sound);
    }

    return result;
  }

  isRegistered(id: string): boolean {
    return this.sounds.has(id);
  }
}
