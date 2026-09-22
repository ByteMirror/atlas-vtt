import type { App } from 'obsidian';

const importing = new WeakSet<App>();

/** Shared by direct note import and the editable preview queue. */
export async function withStatblockImportLock<T>(app: App, run: () => Promise<T>): Promise<T> {
  if (importing.has(app)) throw new Error('A statblock import is already running. Wait for it to finish.');
  importing.add(app);
  try { return await run(); } finally { importing.delete(app); }
}
