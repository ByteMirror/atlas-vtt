import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { readMapClipboard, writeMapClipboard } from './mapClipboard';
import { collectMapObjects, countMapObjects, type MapObjectContent, type Point } from './mapObjectContent';
import { pasteOffset, placeMapObjects } from './mapObjectPlacement';

type ClipboardStore = Pick<StoreApi<ViewAtlasState>, 'getState'>;

/** Players never edit the map, and walls keep their own selection, so the wall tool opts out too. */
function canEditMapObjects(state: ViewAtlasState): boolean {
  return !state.isPlayerView && state.activeTool !== 'wall';
}

/** Ids that copy, cut and duplicate act on. */
function editableSelection(state: ViewAtlasState): string[] {
  return canEditMapObjects(state) ? state.selectedIds : [];
}

function copyableContent(state: ViewAtlasState, ids: readonly string[]): MapObjectContent | null {
  const content = collectMapObjects(state.objects, ids);
  return countMapObjects(content) > 0 ? content : null;
}

/** Puts the tokens, drawings, texts and pins with the given ids on the clipboard. Returns whether anything was copied. */
export async function copyMapObjects(store: ClipboardStore, ids: readonly string[]): Promise<boolean> {
  const content = copyableContent(store.getState(), ids);
  if (!content) return false;
  await writeMapClipboard(content);
  return true;
}

export function copySelection(store: ClipboardStore): Promise<boolean> {
  return copyMapObjects(store, editableSelection(store.getState()));
}

/** Copies the selection, then removes it from the map in one undo step. */
export async function cutSelection(store: ClipboardStore): Promise<boolean> {
  const state = store.getState();
  const ids = editableSelection(state);
  const content = copyableContent(state, ids);
  if (!content) return false;
  state.removeMapObjects(ids);
  await writeMapClipboard(content);
  return true;
}

/** Pastes the clipboard centred on `target` (world coordinates) and returns the ids of the copies. */
export async function pasteClipboard(store: ClipboardStore, target: Point): Promise<string[]> {
  const content = await readMapClipboard();
  const state = store.getState();
  if (!content || !canEditMapObjects(state)) return [];
  const placed = placeMapObjects(content, pasteOffset(content, target, state.grid), state.grid, state.objects);
  return state.insertMapObjects(placed);
}

/** Duplicates the selection one grid cell away and returns the ids of the copies. */
export function duplicateSelection(store: ClipboardStore): string[] {
  const state = store.getState();
  return state.duplicateMapObjects(editableSelection(state));
}
