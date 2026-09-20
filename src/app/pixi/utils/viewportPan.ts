import type { ViewAtlasState } from '../../storeFactory';

type Tool = ViewAtlasState['activeTool'];

/**
 * Tools that leave the viewport's `drag` plugin running.
 *
 * Panning is bound to the right mouse button, so any tool that only uses the
 * left button can safely keep it enabled. Tools that own the whole pointer
 * (fog, text, note pins) still pause it.
 */
const PAN_ENABLED_TOOLS: ReadonlySet<string> = new Set<Tool>([
  'move',
  'measure',
  'measure-circle',
  'measure-cone',
  'laser-pointer',
  'draw-pen',
  'draw-eraser',
  'draw-icon',
]);

export function isViewportPanEnabled(tool: string): boolean {
  return PAN_ENABLED_TOOLS.has(tool);
}
