import { Container, Graphics } from 'pixi.js';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { destroyTree } from '../utils/destroyTree';

/** Above the lighting layer and token UI, so the GM finds doors in the dark. */
export const DOOR_ICONS_Z_INDEX = 1150;
/** Badge radius as a share of a grid cell. */
const BADGE_SHARE = 0.2;

const DOOR_COLOR = 0x44aaff;
const SECRET_DOOR_COLOR = 0xff8844;

function isDoor(wall: WallSegment): boolean {
  return wall.type === 'door' || wall.type === 'secret-door';
}

function midpoint(wall: WallSegment): Point {
  return { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 };
}

/**
 * A badge on every door for the GM: click it with any tool to open or close the door.
 * It is redrawn only when the walls change, and never reaches the player view.
 */
export class DoorIcons {
  readonly view = new Container({ label: 'door-icons' });
  private readonly graphics = new Graphics();
  private readonly unsubscribe: () => void;

  constructor(private readonly store: ViewAtlasStore) {
    this.view.zIndex = DOOR_ICONS_Z_INDEX;
    this.view.eventMode = 'none';
    this.view.addChild(this.graphics);
    this.unsubscribe = store.subscribe((state, previous) => {
      if (state.objects.walls !== previous.objects.walls || state.grid !== previous.grid) this.draw(state);
    });
    this.draw(store.getState());
  }

  /** The door whose badge is at the point, if any. */
  hitTest(x: number, y: number): string | null {
    if (!this.view.visible) return null;
    const state = this.store.getState();
    const radius = this.radius(state);
    for (const wall of Object.values(state.objects.walls)) {
      if (!isDoor(wall)) continue;
      const centre = midpoint(wall);
      if (Math.hypot(x - centre.x, y - centre.y) <= radius) return wall.id;
    }
    return null;
  }

  toggle(wallId: string): void {
    this.store.getState().toggleDoor(wallId);
  }

  private radius(state: ViewAtlasState): number {
    return (state.grid?.size ?? 70) * BADGE_SHARE;
  }

  private draw(state: ViewAtlasState): void {
    const g = this.graphics;
    g.clear();
    const r = this.radius(state);
    for (const wall of Object.values(state.objects.walls)) {
      if (!isDoor(wall)) continue;
      const { x, y } = midpoint(wall);
      const color = wall.type === 'secret-door' ? SECRET_DOOR_COLOR : DOOR_COLOR;
      const open = !(wall.closed ?? true);
      g.circle(x, y, r).fill({ color: 0x1b1b1f, alpha: 0.85 }).stroke({ width: r * 0.14, color });
      // A closed door is a solid leaf; an open one is its outline swung aside.
      const w = r * 0.7;
      const h = r * 1.0;
      if (open) g.rect(x - w / 2 - r * 0.1, y - h / 2, w * 0.35, h).fill({ color });
      else g.rect(x - w / 2, y - h / 2, w, h).fill({ color });
    }
  }

  destroy(): void {
    this.unsubscribe();
    destroyTree(this.view);
  }
}
