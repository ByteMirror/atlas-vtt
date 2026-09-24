import type { Transition, Variants } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';

// Motion of the floating sidebar. It slides in from the window's left edge on a
// spring with a touch of bounce and slides out on a critically damped, quicker
// one; springs keep their velocity, so reversing half way (the pointer comes
// back) stays smooth. Its contents trail the card slightly, which gives the
// card depth. Docked, nothing moves.

const SHOW: Transition = { type: 'spring', visualDuration: 0.35, bounce: 0.12 };
const HIDE: Transition = { type: 'spring', visualDuration: 0.25, bounce: 0 };
const INSTANT: Transition = { duration: 0 };

/** Variant names, chosen by `sidebarMotionState`. */
export type SidebarMotionState = 'docked' | 'shown' | 'hidden';

export function sidebarMotionState(isFloating: boolean, isPeeking: boolean): SidebarMotionState {
  if (!isFloating) return 'docked';
  return isPeeking ? 'shown' : 'hidden';
}

/** Full transform strings, so Motion can run the animation on the compositor. */
export const sidebarVariants: Variants = {
  docked: { transform: 'translateX(0%)', visibility: 'visible', transition: INSTANT },
  shown: { transform: 'translateX(0%)', visibility: 'visible', transition: SHOW },
  // Past its own width plus the inset and shadow, then hidden from assistive tech and the tab order.
  hidden: { transform: 'translateX(-112%)', transition: HIDE, transitionEnd: { visibility: 'hidden' } },
};

export const sidebarContentVariants: Variants = {
  docked: { opacity: 1, transform: 'translateX(0px)', transition: INSTANT },
  shown: { opacity: 1, transform: 'translateX(0px)', transition: { ...SHOW, delay: 0.04 } },
  hidden: { opacity: 0, transform: 'translateX(-24px)', transition: { duration: 0.15, ease: EASE_OUT_CONTROL_POINTS } },
};
