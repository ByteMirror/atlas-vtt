import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { Application } from 'pixi.js';
import type { PixiRendererOrchestrator } from '../../PixiRendererOrchestrator';
import type { AtlasView } from '../../atlas-view';

export interface AtlasUIContextValue {
  app: App;
  view: AtlasView | null;
  pixiApp: Application | null;
  renderer: PixiRendererOrchestrator | null;
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
