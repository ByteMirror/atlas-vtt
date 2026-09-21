import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction, runHistoryTransaction } from '../../stores/history';
import type { WallRenderer } from './WallRenderer';
import type { WallType } from '../../types/wallTypes';

const SHARED_VERTEX_TOLERANCE = 2;

interface VertexDragState {
  type: 'vertex';
  wallId: string;
  vertex: 'p1' | 'p2';
  startX: number;
  startY: number;
  linkedVertices: Array<{ wallId: string; vertex: 'p1' | 'p2' }>;
}

interface LightDragState {
  type: 'light';
  lightId: string;
  startX: number;
  startY: number;
}

type DragState = VertexDragState | LightDragState;

/**
 * Handles wall/light interaction: multi-selection, endpoint dragging,
 * door toggling, bulk type changes, and deletion.
 *
 * Multi-select: Ctrl/Cmd+click toggles a wall chain in/out of the selection.
 * Plain click replaces the selection with the clicked chain.
 */
/** Door placement mode: user is sliding a door preview along a wall. */
interface DoorPlacementState {
  wallId: string;
  doorType: 'door' | 'secret-door';
  /** Current projected position on the wall (0–1 parameter). */
  t: number;
}

const DOOR_HALF_WIDTH = 20; // Half-width of the door segment in world pixels

export class WallInteraction {
  private store: StoreApi<ViewAtlasState>;
  private wallRenderer: WallRenderer;
  private dragState: DragState | null = null;
  private selectedWallIds: Set<string> = new Set();
  private selectedLightIds: Set<string> = new Set();
  private doorPlacement: DoorPlacementState | null = null;

  constructor(store: StoreApi<ViewAtlasState>, wallRenderer: WallRenderer) {
    this.store = store;
    this.wallRenderer = wallRenderer;
  }

  /** Handle pointer down. Returns true if something was hit. */
  handlePointerDown(worldX: number, worldY: number, addToSelection: boolean = false): boolean {
    // 1. Check vertex handles first (for dragging)
    const vertexHit = this.wallRenderer.hitTestVertices(worldX, worldY);
    if (vertexHit) {
      this.selectWallChain(vertexHit.wallId, addToSelection);
      this.startVertexDrag(vertexHit.wallId, vertexHit.vertex, worldX, worldY);
      return true;
    }

    // 2. Check walls
    const wallId = this.wallRenderer.hitTestWalls(worldX, worldY);
    if (wallId) {
      this.selectWallChain(wallId, addToSelection);
      // Toggle door on plain click (not multi-select)
      if (!addToSelection) {
        const wall = this.store.getState().objects.walls[wallId];
        if (wall && (wall.type === 'door' || wall.type === 'secret-door')) {
          this.store.getState().toggleDoor(wallId);
        }
      }
      return true;
    }

    // 3. Check lights (select + start drag)
    const lightId = this.wallRenderer.hitTestLights(worldX, worldY);
    if (lightId) {
      this.selectLight(lightId, addToSelection);
      this.startDrag({ type: 'light', lightId, startX: worldX, startY: worldY });
      return true;
    }

    // Clicked on nothing — clear unless adding to selection
    if (!addToSelection) {
      this.clearSelection();
    }
    return false;
  }

  handlePointerMove(worldX: number, worldY: number): void {
    if (!this.dragState) return;

    const state = this.store.getState();

    if (this.dragState.type === 'vertex') {
      for (const link of this.dragState.linkedVertices) {
        state.updateWall(link.wallId, {
          [link.vertex]: { x: worldX, y: worldY },
        });
      }
    } else if (this.dragState.type === 'light') {
      state.updateLight(this.dragState.lightId, { x: worldX, y: worldY });
    }
  }

  handlePointerUp(): void {
    this.endDrag();
  }

  /** Live drag writes hit the store on every move; the transaction folds them into one undo step. */
  private startDrag(dragState: DragState): void {
    this.endDrag();
    this.dragState = dragState;
    beginHistoryTransaction(this.store);
  }

  private endDrag(): void {
    if (!this.dragState) return;
    this.dragState = null;
    endHistoryTransaction(this.store);
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────

  /** Delete all selected walls and lights. */
  deleteSelected(): void {
    if (this.selectedWallIds.size > 0) {
      this.store.getState().deleteWalls(Array.from(this.selectedWallIds));
      this.selectedWallIds.clear();
      this.wallRenderer.setSelectedWalls([]);
    }
    if (this.selectedLightIds.size > 0) {
      for (const id of this.selectedLightIds) {
        this.store.getState().deleteLight(id);
      }
      this.selectedLightIds.clear();
      this.wallRenderer.setSelectedLights([]);
    }
  }

  /** Change the type of all selected walls. */
  changeSelectedWallType(type: WallType): void {
    const state = this.store.getState();
    for (const id of this.selectedWallIds) {
      const updates: Record<string, unknown> = { type };
      if (type === 'door' || type === 'secret-door') {
        const wall = state.objects.walls[id];
        if (wall && wall.closed === undefined) {
          updates.closed = true;
        }
      }
      state.updateWall(id, updates);
    }
    this.wallRenderer.forceRedraw();
  }

  /** Set the light pass-through direction on all selected walls. */
  setSelectedDirection(direction: 'left' | 'right' | undefined): void {
    const state = this.store.getState();
    for (const id of this.selectedWallIds) {
      state.updateWall(id, { direction });
    }
    this.wallRenderer.forceRedraw();
  }

  // ─── Door Placement ───────────────────────────────────────────────

  /** Enter door placement mode: the user will slide a door along `wallId`. */
  startDoorPlacement(wallId: string, doorType: 'door' | 'secret-door'): void {
    this.doorPlacement = { wallId, doorType, t: 0.5 };
    // Highlight the target wall
    this.selectedWallIds = new Set([wallId]);
    this.selectedLightIds.clear();
    this.syncRendererSelection();
  }

  /** Update the door preview position as the user moves the mouse. */
  updateDoorPlacement(worldX: number, worldY: number): void {
    if (!this.doorPlacement) return;
    const wall = this.store.getState().objects.walls[this.doorPlacement.wallId];
    if (!wall) { this.cancelDoorPlacement(); return; }

    this.doorPlacement.t = this.projectOntoWall(wall, worldX, worldY);
    this.wallRenderer.setDoorPreview(wall, this.doorPlacement.t, this.doorPlacement.doorType);
  }

  /** Confirm door placement: split the wall and insert a door segment. */
  confirmDoorPlacement(): void {
    if (!this.doorPlacement) return;
    const state = this.store.getState();
    const wall = state.objects.walls[this.doorPlacement.wallId];
    if (!wall) { this.cancelDoorPlacement(); return; }

    const t = this.doorPlacement.t;
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Door half-width as a proportion of wall length
    const doorHalfT = len > 0 ? DOOR_HALF_WIDTH / len : 0.1;
    const tStart = Math.max(0.01, t - doorHalfT);
    const tEnd = Math.min(0.99, t + doorHalfT);

    const pStart = { x: wall.p1.x + dx * tStart, y: wall.p1.y + dy * tStart };
    const pMid1 = { x: wall.p1.x + dx * tStart, y: wall.p1.y + dy * tStart };
    const pMid2 = { x: wall.p1.x + dx * tEnd, y: wall.p1.y + dy * tEnd };
    const pEnd = { x: wall.p1.x + dx * tEnd, y: wall.p1.y + dy * tEnd };

    const shared = {
      ...(wall.chainId !== undefined && { chainId: wall.chainId }),
      ...(wall.direction !== undefined && { direction: wall.direction }),
    };
    const doorType = this.doorPlacement.doorType;

    // Replacing one wall with up to three segments is a single undoable edit
    runHistoryTransaction(this.store, () => {
      state.deleteWall(wall.id);

      if (tStart > 0.02) {
        state.addWall({ type: wall.type, p1: wall.p1, p2: pStart, ...shared });
      }

      state.addWall({ type: doorType, p1: pMid1, p2: pMid2, closed: true, ...shared });

      if (tEnd < 0.98) {
        state.addWall({ type: wall.type, p1: pEnd, p2: wall.p2, ...shared });
      }
    });

    this.doorPlacement = null;
    this.wallRenderer.clearDoorPreview();
    this.clearSelection();
  }

  /** Cancel door placement mode. */
  cancelDoorPlacement(): void {
    this.doorPlacement = null;
    this.wallRenderer.clearDoorPreview();
  }

  isPlacingDoor(): boolean {
    return this.doorPlacement !== null;
  }

  /** Project a world point onto a wall segment, returning t in [0, 1]. */
  private projectOntoWall(wall: { p1: { x: number; y: number }; p2: { x: number; y: number } }, worldX: number, worldY: number): number {
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0.5;
    return Math.max(0.05, Math.min(0.95,
      ((worldX - wall.p1.x) * dx + (worldY - wall.p1.y) * dy) / lenSq
    ));
  }

  // ─── Getters ──────────────────────────────────────────────────────

  getSelectedWallIds(): string[] {
    return Array.from(this.selectedWallIds);
  }

  getSelectedLightIds(): string[] {
    return Array.from(this.selectedLightIds);
  }

  hasSelection(): boolean {
    return this.selectedWallIds.size > 0 || this.selectedLightIds.size > 0;
  }

  isDragging(): boolean {
    return this.dragState !== null;
  }

  // ─── Selection Logic ─────────────────────────────────────────────────

  /**
   * Select a wall chain. With addToSelection, toggles the chain in/out.
   * Without it, replaces the selection.
   */
  private selectWallChain(wallId: string, addToSelection: boolean): void {
    const walls = this.store.getState().objects.walls;
    const wall = walls[wallId];
    if (!wall) return;

    // Resolve chain IDs
    const chainId = wall.chainId;
    const chainIds: string[] = chainId
      ? Object.values(walls).filter(w => w.chainId === chainId).map(w => w.id)
      : [wallId];

    if (addToSelection) {
      // Toggle: if the chain is already fully selected, deselect it; otherwise add it
      const allSelected = chainIds.every(id => this.selectedWallIds.has(id));
      if (allSelected) {
        for (const id of chainIds) this.selectedWallIds.delete(id);
      } else {
        for (const id of chainIds) this.selectedWallIds.add(id);
      }
    } else {
      // Replace selection with this chain
      this.selectedWallIds = new Set(chainIds);
      this.selectedLightIds.clear();
    }

    this.syncRendererSelection();
  }

  private selectLight(lightId: string, addToSelection: boolean): void {
    if (addToSelection) {
      if (this.selectedLightIds.has(lightId)) {
        this.selectedLightIds.delete(lightId);
      } else {
        this.selectedLightIds.add(lightId);
      }
    } else {
      this.selectedLightIds = new Set([lightId]);
      this.selectedWallIds.clear();
    }

    this.syncRendererSelection();
  }

  clearSelection(): void {
    this.selectedWallIds.clear();
    this.selectedLightIds.clear();
    this.syncRendererSelection();
  }

  private syncRendererSelection(): void {
    this.wallRenderer.setSelectedWalls(Array.from(this.selectedWallIds));
    this.wallRenderer.setSelectedLights(Array.from(this.selectedLightIds));
  }

  private startVertexDrag(wallId: string, vertex: 'p1' | 'p2', worldX: number, worldY: number): void {
    const walls = this.store.getState().objects.walls;
    const wall = walls[wallId];
    if (!wall) return;

    const dragPoint = wall[vertex];

    // Find all walls sharing this vertex position
    const linked: VertexDragState['linkedVertices'] =[{ wallId, vertex }];

    for (const other of Object.values(walls)) {
      if (other.id === wallId) continue;
      if (Math.abs(other.p1.x - dragPoint.x) < SHARED_VERTEX_TOLERANCE &&
          Math.abs(other.p1.y - dragPoint.y) < SHARED_VERTEX_TOLERANCE) {
        linked.push({ wallId: other.id, vertex: 'p1' });
      }
      if (Math.abs(other.p2.x - dragPoint.x) < SHARED_VERTEX_TOLERANCE &&
          Math.abs(other.p2.y - dragPoint.y) < SHARED_VERTEX_TOLERANCE) {
        linked.push({ wallId: other.id, vertex: 'p2' });
      }
    }

    this.startDrag({
      type: 'vertex',
      wallId,
      vertex,
      startX: worldX,
      startY: worldY,
      linkedVertices: linked,
    });
  }

  destroy(): void {
    this.endDrag();
  }
}
