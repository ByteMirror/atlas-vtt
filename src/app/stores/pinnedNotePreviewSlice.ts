/**
 * Pinned note previews, saved per map so they reopen where the user left them
 * whenever the map loads again (scene switch, reopened map, restart).
 */

/** Position and size of a preview window in CSS pixels. */
export interface PreviewWindowLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A pinned preview as saved in the map file. */
export interface PinnedNotePreview extends PreviewWindowLayout {
  /** The pin or token the preview was opened from. */
  anchorId: string;
  /** The linked note, including its `#heading` when the link has one. */
  notePath: string;
}

export interface PinnedNotePreviewSlice {
  /** Keyed by anchor id: a pin or token has at most one preview. */
  pinnedNotePreviews: Record<string, PinnedNotePreview>;
  savePinnedNotePreview: (preview: PinnedNotePreview) => void;
  removePinnedNotePreview: (anchorId: string) => void;
}

type ImmerSet = (fn: (draft: Pick<PinnedNotePreviewSlice, 'pinnedNotePreviews'>) => void) => void;

export function createPinnedNotePreviewActions(
  set: ImmerSet,
): Pick<PinnedNotePreviewSlice, 'savePinnedNotePreview' | 'removePinnedNotePreview'> {
  return {
    savePinnedNotePreview: (preview) => set((draft) => {
      draft.pinnedNotePreviews[preview.anchorId] = preview;
    }),
    removePinnedNotePreview: (anchorId) => set((draft) => {
      delete draft.pinnedNotePreviews[anchorId];
    }),
  };
}

function isPinnedNotePreview(value: unknown): value is PinnedNotePreview {
  if (typeof value !== 'object' || value === null) return false;
  const { anchorId, notePath, left, top, width, height } = value as Record<string, unknown>;
  return typeof anchorId === 'string'
    && typeof notePath === 'string'
    && [left, top, width, height].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** The valid entries of a map's saved previews; the field comes from the map file unchecked. */
export function readPinnedNotePreviews(value: unknown): PinnedNotePreview[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).filter(isPinnedNotePreview);
}
