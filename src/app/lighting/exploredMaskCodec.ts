/** Longest side of a saved explored mask; it is shown dim and soft, so small is enough. */
export const EXPLORED_SAVE_MAX = 1024;

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export interface Size {
  width: number;
  height: number;
}

/** The size an explored mask is saved at: at most `EXPLORED_SAVE_MAX` on its longest side. */
export function exploredSaveSize(size: Size): Size {
  const scale = Math.min(1, EXPLORED_SAVE_MAX / Math.max(size.width, size.height, 1));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/** The saved mask if it is a PNG data URL; map files arrive unchecked. */
export function readExploredMask(value: unknown): string | null {
  return typeof value === 'string' && PNG_DATA_URL.test(value) ? value : null;
}
