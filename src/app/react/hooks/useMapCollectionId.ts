import { AssetService } from '../../services/AssetService';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';

/** The collection of the view's scene, or null for scenes outside any collection. */
export function useMapCollectionId(): string | null {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  return mapPath ? AssetService.getInstance(app).getCollectionForMap(mapPath) : null;
}
