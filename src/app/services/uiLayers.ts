/** The layer of a map's UI that holds its note previews. */
export const NOTE_PREVIEW_LAYER_CLASS = 'atlas-note-preview-layer';

export interface UILayers {
  /** Stacks the whole UI above the canvas. */
  container: HTMLDivElement;
  /** Where React renders; creates no stacking context of its own. */
  reactRoot: HTMLDivElement;
  notePreviews: HTMLDivElement;
}

/**
 * Builds a map's UI layer. The React UI and the note previews share one
 * stacking context, so previews stack between the React UI's bars and its
 * overlays, such as the DM screen (`$z-atlas-note-preview`).
 */
export function createUILayers(parent: HTMLElement): UILayers {
  const container = parent.createDiv({ cls: 'atlas-vtt-plugin atlas-react-ui-container' });
  const fill = { position: 'absolute', inset: '0', pointerEvents: 'none' };
  Object.assign(container.style, fill, { zIndex: '1000' });
  const reactRoot = container.createDiv();
  Object.assign(reactRoot.style, fill);
  const notePreviews = container.createDiv({ cls: NOTE_PREVIEW_LAYER_CLASS });
  return { container, reactRoot, notePreviews };
}
