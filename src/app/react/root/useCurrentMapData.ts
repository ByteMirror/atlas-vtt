import { useEffect, useState } from 'react';
import type { AtlasView } from '../../atlas-view';

// TODO: Add specific type for view and initial map data
export const useCurrentMapData = (view: AtlasView, initial: any): any => {
  const [mapData, setMapData] = useState(() => initial ?? view?.serviceManager.getMapService().getCurrentMapData() ?? null);

  useEffect(() => {
    const handler = (): void => {
      setMapData(view?.serviceManager.getMapService().getCurrentMapData() ?? null);
    };

    // Make sure view is available before adding listener
    if (view) {
      window.addEventListener('atlas-map-data-update', handler);
    }

    // Cleanup function
    return () => {
      if (view) {
        window.removeEventListener('atlas-map-data-update', handler);
      }
    };
  }, [view]); // Dependency array includes view

  // Also update if the initial prop changes (e.g., initial map load)
  useEffect(() => {
    setMapData(initial ?? view?.serviceManager.getMapService().getCurrentMapData() ?? null);
  }, [initial, view?.serviceManager.getMapService().getCurrentMapData()]);

  return mapData;
}; 