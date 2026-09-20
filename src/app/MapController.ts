import { App } from 'obsidian';
import { Sprite } from 'pixi.js';
import { MapLoader } from './MapLoader';
import { PixiRendererOrchestrator } from './PixiRendererOrchestrator';
import type { GridOptions } from './grid/GridSystem';

/**
 * Load the given map file, create background sprite, initialise grid and
 * return the parsed mapData.
 */
async function loadAndDisplay(
  app: App,
  renderer: PixiRendererOrchestrator,
  filePath: string,
  restoreCamera: boolean = true,
): Promise<any /* mapData */> {
  const { mapData, texture } = await MapLoader.load(app, filePath);

  // Set background texture (will be placeholder if no real background)
  const sprite = Sprite.from(texture);

  // Ensure sprite dimensions are set from texture if available
  if (texture.width > 0 && texture.height > 0) {
    sprite.width = texture.width;
    sprite.height = texture.height;
  }

  renderer.setBackgroundSprite(sprite);

  // Prepare grid options derived from map meta – but always start enabled so
  // the user instantly sees it and can toggle off later.
  // Check if we have a more recent offset in the renderer's grid system
  const currentGridSystem = renderer.getGridSystem();
  const currentOffset = currentGridSystem ? {
    x: currentGridSystem.getOptions().offsetX ?? 0,
    y: currentGridSystem.getOptions().offsetY ?? 0
  } : { x: 0, y: 0 };

  // Use current offset if grid system exists, otherwise use map data
  const shouldUseCurrentOffset = currentGridSystem !== null;

  const gridOptions: GridOptions = {
    type: mapData.grid?.type ?? 'square',
    size: mapData.grid?.size ?? 70,
    offsetX: shouldUseCurrentOffset ? currentOffset.x : (mapData.grid?.offsetX ?? 0),
    offsetY: shouldUseCurrentOffset ? currentOffset.y : (mapData.grid?.offsetY ?? 0),
    color: parseInt((mapData.grid?.color ?? '#FFFFFF').replace('#', '0x')),
    alpha: mapData.grid?.opacity ?? 0.7,
    enabled: true,
  } as const;


  renderer.initGrid(gridOptions, sprite);

  // Restore camera state if present, otherwise center and fit
  const viewport = renderer.getViewportInstance();
  if (viewport) {
    // Always center and fit on initial load, unless explicitly restoring camera
    // Check if camera has valid values (not just default 0,0,1)
    const hasValidCamera = mapData.camera &&
                         (mapData.camera.x !== 0 || mapData.camera.y !== 0 || mapData.camera.scale !== 1);

    if (restoreCamera && hasValidCamera) {
      // Restore saved camera position
      viewport.moveCenter(mapData.camera.x, mapData.camera.y);
      viewport.setZoom(mapData.camera.scale);
    } else {
      // Center and fit the map in the viewport
      centerAndFitMap(renderer, sprite);
    }
  } else {
    console.warn('[MapController] Viewport not available for camera positioning');
  }

  // Ensure in‑memory map data reflects current grid enabled status so the UI
  // shows the correct state.
  if (mapData.grid) {
    mapData.grid.enabled = true;
  } else {
    mapData.grid = {
      enabled: true,
      size: gridOptions.size,
      offsetX: gridOptions.offsetX ?? 0,
      offsetY: gridOptions.offsetY ?? 0,
      color: '#00FFFF',
      opacity: 0.7,
    };
  }

  return mapData;
}

/**
 * Centers the viewport on the map and zooms out to fit the entire map.
 */
function centerAndFitMap(renderer: PixiRendererOrchestrator, backgroundSprite: Sprite): void {
  const viewport = renderer.getViewportInstance();
  if (!viewport) {
    console.warn('[MapController] Cannot center map: viewport not available');
    return;
  }

  // Get the dimensions of the background sprite
  const mapWidth = backgroundSprite.width;
  const mapHeight = backgroundSprite.height;

  // Get the viewport dimensions
  const viewportWidth = viewport.screenWidth;
  const viewportHeight = viewport.screenHeight;

  // Calculate the scale needed to fit the entire map in the viewport
  // We want to fit the map with some padding
  const padding = 0.9; // 90% of viewport size
  const scaleX = (viewportWidth * padding) / mapWidth;
  const scaleY = (viewportHeight * padding) / mapHeight;
  const scale = Math.min(scaleX, scaleY);

  // Clamp the scale to the viewport's zoom limits
  const clampedScale = Math.max(0.1, Math.min(scale, 5));

  // Set the scale
  viewport.setZoom(clampedScale);

  // Center the viewport on the map
  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;
  viewport.moveCenter(centerX, centerY);

}

/**
 * Handles loading map resources and initialising renderer state.
 */
export const MapController = { loadAndDisplay };
