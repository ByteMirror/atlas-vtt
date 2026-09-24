import { useAtlasUI } from '../root/AtlasUIContext';
import { createTabMetaStore, type TabMetaStore } from '../../stores/tabMetaStore';

/** Static empty store used as safe fallback when view.tabMetaStore is unavailable. */
const EMPTY_TAB_STORE = createTabMetaStore();

/** Scene tab store of the surrounding map view. */
export function useSceneTabStore(): TabMetaStore {
  const { view } = useAtlasUI();
  return view?.tabMetaStore ?? EMPTY_TAB_STORE;
}
