/** Web Animations counterparts of the motion tokens in styles/_tokens.scss. */

/** `$transition-ease-out`: entering and leaving elements. */
export const MOTION_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** `$transition-normal` */
export const MOTION_NORMAL_MS = 200;
/** `$transition-slow` */
export const MOTION_SLOW_MS = 300;

/** Whether the window `node` lives in (main or popout) asks for reduced motion. */
export function prefersReducedMotion(node: Node): boolean {
  return node.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
