import type { App } from 'obsidian';
import type { DicePack } from './engine/DiceEngine';

/** The pack Atlas ships its physical dice with, under `<plugin>/dice/`. */
export const DEFAULT_DICE_PACK = 'Texture-Pack-Default';

const PACK_TYPES = ['d4', 'd6', 'd8', 'd10', 'd100', 'd12', 'd20'];

export interface LoadedDicePack {
  pack: DicePack;
  textures: Record<string, string>;
  normals: Record<string, string>;
}

/**
 * Reads a dice pack: `pack.json` describes the set, and each die's face sheet
 * sits beside it (`<type>_Numbers.png` unless the manifest names another).
 * Returns null when there is no pack at `root`; the dice then render plain.
 */
export async function loadDicePack(app: App, root: string | null): Promise<LoadedDicePack | null> {
  if (!root) return null;
  const adapter = app.vault.adapter;

  let pack: DicePack;
  try {
    pack = JSON.parse(await adapter.read(`${root}/pack.json`)) as DicePack;
  } catch {
    return null;
  }

  const files = (key: 'texture' | 'normal'): Record<string, string> => {
    const urls: Record<string, string> = {};
    for (const type of PACK_TYPES) {
      const named = pack.dice?.[type]?.[key];
      const file = named || (key === 'texture' ? `${type}_Numbers.png` : null);
      if (file) urls[type] = adapter.getResourcePath(`${root}/${file}`);
    }
    return urls;
  };

  return { pack, textures: files('texture'), normals: files('normal') };
}
