import { INVALID_NAME_CHARACTERS } from '../../services/assetPaths';
import { UVTT_EXTENSIONS } from './uvttTypes';

/** What a file picker accepts beside images to offer Universal VTT maps. */
export const UVTT_ACCEPT = UVTT_EXTENSIONS.map((extension) => `.${extension}`).join(',');

const INVALID_CHARACTERS = new RegExp(INVALID_NAME_CHARACTERS.source, 'g');

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Whether a file is a Universal VTT map by its name; its content is checked when it is read. */
export function isUvttFileName(fileName: string): boolean {
  return (UVTT_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));
}

/** The name a file's map and scene get: the file's name without its extension, as a vault file may be called. */
export function uvttSceneName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const name = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .replace(INVALID_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  return name || 'Imported map';
}
