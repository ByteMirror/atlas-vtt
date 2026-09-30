import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { WallInput } from '../../types/wallTypes';

/**
 * One wall chain or freehand stroke being drawn. Segments go into the store as they are
 * placed, so walls and shadows appear live, inside one history transaction: the finished
 * chain is a single undo step and a cancelled one leaves no step at all.
 */
export class WallDrawingSession {
  private wallIds: string[] = [];
  private drawing = false;
  private startObjects: ViewAtlasState['objects'] | null = null;

  constructor(private readonly store: StoreApi<ViewAtlasState>) {}

  get active(): boolean {
    return this.drawing;
  }

  start(): void {
    this.finish();
    this.drawing = true;
    this.wallIds = [];
    this.startObjects = this.store.getState().objects;
    beginHistoryTransaction(this.store);
  }

  add(wall: WallInput): string {
    const id = this.store.getState().addWall(wall);
    if (this.drawing) this.wallIds.push(id);
    return id;
  }

  finish(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.wallIds = [];
    this.startObjects = null;
    endHistoryTransaction(this.store);
  }

  /**
   * Removes what this chain placed. History compares objects by reference, so when only the
   * walls changed the objects from before the chain are put back as they were, leaving no step.
   */
  cancel(): void {
    if (!this.drawing) return;
    const start = this.startObjects;
    const current = this.store.getState().objects;
    if (start && onlyWallsChanged(start, current)) this.store.setState({ objects: start });
    else if (this.wallIds.length > 0) this.store.getState().deleteWalls(this.wallIds);
    this.finish();
  }
}

function onlyWallsChanged(a: ViewAtlasState['objects'], b: ViewAtlasState['objects']): boolean {
  const keys = Object.keys(a) as Array<keyof ViewAtlasState['objects']>;
  return keys.every((key) => key === 'walls' || a[key] === b[key]);
}
