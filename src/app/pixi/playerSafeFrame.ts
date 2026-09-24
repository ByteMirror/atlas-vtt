import type { PlayerCameraState } from '../local-player-view';

/** Anything whose `visible` flag decides whether it is part of the next render. */
export interface HideableLayer {
  visible: boolean;
  alpha?: number | undefined;
}

/**
 * Runs `capture` while the canvas holds a frame without `dmOnlyLayers`, then
 * restores the DM's frame. Everything happens in one task, before the browser
 * composites, so the DM never sees the player-safe frame.
 */
export function captureWithoutLayers(
  dmOnlyLayers: readonly HideableLayer[],
  render: () => void,
  capture: () => void
): void {
  captureWithLayerVisibility(dmOnlyLayers.map(layer => ({ layer, visible: false })), render, capture);
}

export interface LayerVisibility {
  layer: HideableLayer;
  visible: boolean;
  alpha?: number;
}

/** Sprites of hidden tokens: the DM sees them translucent, players must not see them at all. */
export function hiddenTokenLayers(
  tokens: Record<string, { isHidden?: boolean }>,
  sprites: Record<string, HideableLayer | null>,
): LayerVisibility[] {
  const layers: LayerVisibility[] = [];
  for (const [tokenId, sprite] of Object.entries(sprites)) {
    if (sprite && tokens[tokenId]?.isHidden) layers.push({ layer: sprite, visible: false });
  }
  return layers;
}

/** The part of a viewport a player camera moves: its screen size and world transform. */
export interface CameraTarget {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly position: { x: number; y: number; set(x: number, y: number): void };
  readonly scale: { x: number; y: number; set(x: number, y: number): void };
}

/** A camera players stay on while the DM's own viewport moves freely. */
export interface PlayerFrameCamera {
  target: CameraTarget;
  camera: PlayerCameraState;
}

/**
 * Point `target` at `camera` by setting its transform directly, so no viewport
 * events or plugin resets fire. Returns a function that restores the DM camera.
 */
function applyCamera({ target, camera }: PlayerFrameCamera): () => void {
  const { x, y } = target.position;
  const { x: scaleX, y: scaleY } = target.scale;
  target.scale.set(camera.scale, camera.scale);
  target.position.set(
    target.screenWidth / 2 - camera.centerX * camera.scale,
    target.screenHeight / 2 - camera.centerY * camera.scale,
  );
  return (): void => {
    target.scale.set(scaleX, scaleY);
    target.position.set(x, y);
  };
}

/**
 * Temporarily apply player visibility, opacity and (optionally) a frozen player
 * camera, then restore the DM frame.
 */
export function captureWithLayerVisibility(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
  camera?: PlayerFrameCamera,
): void {
  const changed = layers.filter(({ layer, visible, alpha }) =>
    layer.visible !== visible || (alpha !== undefined && layer.alpha !== alpha))
    .map(entry => ({ ...entry, previous: entry.layer.visible, previousAlpha: entry.layer.alpha }));
  if (changed.length === 0 && !camera) {
    capture();
    return;
  }
  for (const { layer, visible, alpha } of changed) {
    layer.visible = visible;
    if (alpha !== undefined) layer.alpha = alpha;
  }
  const restoreCamera = camera ? applyCamera(camera) : null;
  try {
    render();
    capture();
  } finally {
    restoreCamera?.();
    for (const { layer, previous, alpha, previousAlpha } of changed) {
      layer.visible = previous;
      if (alpha !== undefined) layer.alpha = previousAlpha;
    }
    render();
  }
}
