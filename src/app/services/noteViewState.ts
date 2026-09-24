import { MarkdownView, type OpenViewState, type View } from 'obsidian';
import type { NoteViewState } from '../stores/pinnedNotePreviewSlice';

/**
 * How the note in a preview's leaf is left. Obsidian reports the cursor in the
 * ephemeral state but the scroll only while a restored one is still pending,
 * so the scroll is read from the markdown view itself.
 */
export function readNoteViewState(view: View): NoteViewState {
  const eState = view.getEphemeralState();
  if (!(view instanceof MarkdownView)) return { eState };
  return { mode: view.getMode(), eState: { ...eState, scroll: view.currentMode.getScroll() } };
}

/** `openFile` options that reopen a note in the mode, at the cursor and scroll it was left. */
export function toOpenViewState(state: NoteViewState | null): OpenViewState {
  if (!state) return { active: false };
  return { active: false, eState: state.eState, ...(state.mode ? { state: { mode: state.mode } } : {}) };
}

/**
 * A preview opens its note before the view is mounted, so Obsidian applies the
 * restored scroll while the view has no layout yet. Applied again once it has one.
 */
export function applyNoteScroll(view: View, state: NoteViewState): void {
  const { scroll } = state.eState;
  if (view instanceof MarkdownView && typeof scroll === 'number') view.currentMode.applyScroll(scroll);
}
