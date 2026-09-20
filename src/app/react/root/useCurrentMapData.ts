import { useEffect, useState } from 'react';

// TODO: Add specific type for view and initial map data
export const useCurrentMapData = (view: any, initial: any): any => {
  const [mapData, setMapData] = useState(() => initial ?? view?.currentMapData ?? null);

  useEffect(() => {
    const handler = (): void => {
      setMapData(view?.currentMapData ?? null);
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
    setMapData(initial ?? view?.currentMapData ?? null);
  }, [initial, view?.currentMapData]);

  return mapData;
}; 