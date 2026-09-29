/** Extension of Atlas scene files, the only files the Atlas view opens. */
export const EXTENSION_ATLASMAP = 'atlasmap';

/** Whether `path` names an Atlas scene file. */
export function isScenePath(path: string): boolean {
  return path.endsWith(`.${EXTENSION_ATLASMAP}`);
}
