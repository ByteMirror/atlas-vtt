/** A scene is named like its file: map files carry no name of their own. */
export function sceneNameOf(path: string | null): string {
  const fileName = path?.replace(/\\/g, '/').split('/').pop() ?? '';
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled Map';
}
