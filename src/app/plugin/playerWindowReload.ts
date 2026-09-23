import type { Plugin } from 'obsidian';
import { LOCAL_PLAYER_VIEW_TYPE } from '../local-player-view';

/**
 * Closes player popouts when the main window unloads.
 *
 * Obsidian only closes popout windows when the app quits. A reload ("Reload app
 * without saving", the CLI's reload) leaves them open, while the reloaded workspace
 * reopens the player view from the saved layout in a new window. Every window left
 * behind kept the previous Obsidian instance alive in memory: its vault index, every
 * plugin and the map view it mirrored.
 */
export function registerPlayerWindowReloadCleanup(plugin: Plugin): void {
  plugin.registerDomEvent(window, 'pagehide', () => {
    for (const leaf of plugin.app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)) {
      const popout = leaf.view.containerEl.win;
      if (popout !== window) popout.close();
    }
  });
}
