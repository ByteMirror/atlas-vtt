import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { Application } from 'pixi.js';
import { LayerManager } from '../../layerManager'; // Adjusted path
import type { PixiRendererOrchestrator } from '../../PixiRendererOrchestrator';
import type { AtlasView } from '../../atlas-view';

export interface AtlasUIContextValue {
  app: App;
  view: AtlasView | null;
  pixiApp: Application | null;
  renderer: PixiRendererOrchestrator | null;
  mapData: any; // TODO: Add specific type for MapData
  layerMgr: LayerManager | null;
}

export const AtlasUIContext =
  createContext<AtlasUIContextValue | null>(null);

export const useAtlasUI = (): AtlasUIContextValue => {
  const ctx = useContext(AtlasUIContext);
  if (!ctx) {
    throw new Error('useAtlasUI must be used within an AtlasUIProvider (or UIRoot)');
  }
  return ctx;
};
