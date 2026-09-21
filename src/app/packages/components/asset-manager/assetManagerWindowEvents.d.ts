import type { CreateScenePrefill } from './hooks/useAssetCrud';

declare global {
  interface WindowEventMap {
    /** Asks the asset manager to open the "create scene" modal prefilled from a map asset. */
    'create-scene-from-map': CustomEvent<CreateScenePrefill>;
  }
}
