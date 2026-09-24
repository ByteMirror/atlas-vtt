import 'obsidian';
import type { EventRef } from 'obsidian';

declare module 'obsidian' {
  interface Workspace {
    /** Triggered by Atlas VTT when asset metadata changed and open asset lists should reload. */
    on(name: 'atlas-vtt:refresh-assets', callback: () => unknown, ctx?: unknown): EventRef;
    /** Triggered by Atlas VTT when a collection's settings (conditions, grid defaults, widgets…) changed. */
    on(name: 'atlas-vtt:collection-settings-changed', callback: (collectionId: string) => unknown, ctx?: unknown): EventRef;
  }
}
