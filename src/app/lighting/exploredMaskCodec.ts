const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** The saved mask if it is a PNG data URL; map files arrive unchecked. */
export function readExploredMask(value: unknown): string | null {
  return typeof value === 'string' && PNG_DATA_URL.test(value) ? value : null;
}
