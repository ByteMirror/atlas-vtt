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

/** Temporarily apply player visibility and opacity, then restore the DM frame. */
export function captureWithLayerVisibility(
  layers: readonly LayerVisibility[],
  render: () => void,
  capture: () => void,
): void {
  const changed = layers.filter(({ layer, visible, alpha }) =>
    layer.visible !== visible || (alpha !== undefined && layer.alpha !== alpha))
    .map(entry => ({ ...entry, previous: entry.layer.visible, previousAlpha: entry.layer.alpha }));
  if (changed.length === 0) {
    capture();
    return;
  }
  for (const { layer, visible, alpha } of changed) {
    layer.visible = visible;
    if (alpha !== undefined) layer.alpha = alpha;
  }
  try {
    render();
    capture();
  } finally {
    for (const { layer, previous, alpha, previousAlpha } of changed) {
      layer.visible = previous;
      if (alpha !== undefined) layer.alpha = previousAlpha;
    }
    render();
  }
}
