import { Container } from 'pixi.js';
import { BAR_SLOTS, type VisibleResource } from '../../../resources/resourceTypes';
import type { ResourceSlot } from './ResourceStack';
import { NAMEPLATE_HEIGHT } from '../tokenSizing';
import { ResourceWheelView, WHEEL_SIZE } from './ResourceWheelView';

export { WHEEL_SIZE };
/** Space between the two wheels of a side, in UI units. */
const WHEEL_GAP = 1.6;
/** Space between an anchor and its wheels, in UI units. */
const WHEEL_MARGIN = 1.5;
/** Bottom of the lower wheel above the anchor: clear of the nameplate, which lies on the token's bottom edge. */
const WHEEL_BASE = NAMEPLATE_HEIGHT + 1;
/** Wheels on each side of the token. */
const WHEELS_PER_SIDE = 2;
/** The +/- stepper a selected token's wheel gets on its outer side: distance from the wheel and button diameter. */
export const WHEEL_STEPPER = { gap: 2, size: 10 } as const;

/**
 * Where the wheel of `slot` sits, in the units of its side's anchor: the first two wheel
 * slots on the token's right, the next two on its left, as a mirror. The first of a side is
 * the upper one. A wheel keeps its own place even when the other slots are empty.
 */
export function wheelSlot(key: string, slot: number): ResourceSlot {
  const index = slot - BAR_SLOTS;
  const onLeft = index >= WHEELS_PER_SIDE;
  const row = index % WHEELS_PER_SIDE === 0 ? 1 : 0;
  return {
    key,
    kind: onLeft ? 'wheel-left' : 'wheel',
    left: onLeft ? -WHEEL_MARGIN - WHEEL_SIZE : WHEEL_MARGIN,
    top: -WHEEL_BASE - WHEEL_SIZE - row * (WHEEL_GAP + WHEEL_SIZE),
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
  };
}

/**
 * A token's wheels beside it: `right` in the units of an anchor past the right resize
 * button on the token's bottom edge (`wheelAnchor`), `left` in those of its mirror on the
 * left. Each stack stands on the nameplate's top line and grows upward with its anchor's
 * scale, as the bars grow downward: at no size can it meet the nameplate or the bars. They
 * show only while revealed (`setAlpha`), on hover and selection.
 */
export class ResourceWheels {
  readonly right = new Container({ eventMode: 'none', interactiveChildren: false });
  readonly left = new Container({ eventMode: 'none', interactiveChildren: false });
  private readonly views = new Map<string, ResourceWheelView>();
  private slots: ResourceSlot[] = [];
  private resolution: number | undefined;

  constructor() {
    this.setAlpha(0);
  }

  update(resources: readonly VisibleResource[]): void {
    const keys = new Set(resources.map(({ definition }) => definition.key));
    for (const [key, view] of this.views) {
      if (keys.has(key)) continue;
      view.destroy();
      this.views.delete(key);
    }
    this.slots = resources.map((resource) => {
      const slot = wheelSlot(resource.definition.key, resource.slot);
      const view = this.viewFor(slot.key);
      // Reordering the collection's resources can move one to the other side
      (slot.kind === 'wheel-left' ? this.left : this.right).addChild(view.view);
      view.update(resource, slot.left + WHEEL_SIZE / 2, slot.top + WHEEL_SIZE / 2);
      return slot;
    });
  }

  /** Where each wheel sits, for the click areas and steppers; the same at every scale of the anchors. */
  layout(): readonly ResourceSlot[] {
    return this.slots;
  }

  setAlpha(alpha: number): void {
    for (const side of [this.right, this.left]) {
      side.alpha = alpha;
      side.visible = alpha > 0;
    }
  }

  /** Rasterisation resolution of the numbers, also of wheels created later. */
  setResolution(resolution: number): void {
    this.resolution = resolution;
    for (const view of this.views.values()) view.setResolution(resolution);
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.right.destroy();
    this.left.destroy();
  }

  private viewFor(key: string): ResourceWheelView {
    const existing = this.views.get(key);
    if (existing) return existing;
    const view = new ResourceWheelView();
    if (this.resolution !== undefined) view.setResolution(this.resolution);
    this.views.set(key, view);
    return view;
  }
}
