import { useReducedMotion, type Variants } from 'framer-motion';
import {
  BACKDROP_ENTER_MS,
  EASE_OUT_CONTROL_POINTS as EASE_OUT,
  PANEL_ENTER_FROM,
  PANEL_ENTER_MS,
  PANEL_EXIT_MS,
  PANEL_EXIT_TO,
} from '../../../utils/motion';

/** Closing mirrors opening, a little quicker and over a shorter distance, so it reads as the same motion in reverse. */
export const DIALOG_EXIT_DURATION = PANEL_EXIT_MS / 1000;

/** The dimmed, blurred backdrop behind a dialog. */
export const dialogBackdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: BACKDROP_ENTER_MS / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DIALOG_EXIT_DURATION, ease: EASE_OUT } },
} satisfies Variants;

/** The dialog window rises and grows into place. Full transform strings keep the animation on the compositor thread. */
export const dialogWindowVariants = {
  hidden: { opacity: 0, transform: PANEL_ENTER_FROM },
  visible: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { duration: PANEL_ENTER_MS / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transform: PANEL_EXIT_TO, transition: { duration: DIALOG_EXIT_DURATION, ease: EASE_OUT } },
} satisfies Variants;

/** Reduced motion keeps the window in place and only fades it. */
const fadingWindowVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: dialogWindowVariants.visible.transition },
  exit: { opacity: 0, transition: dialogWindowVariants.exit.transition },
} satisfies Variants;

/**
 * Spread onto a dialog's overlay, the element that dims the interface and holds the
 * window. The window inherits the overlay's labels through `useDialogWindowVariants`.
 * Clicks pass through a leaving overlay, as they would once it is gone.
 */
export const dialogOverlayMotion = {
  variants: {
    ...dialogBackdropVariants,
    exit: { ...dialogBackdropVariants.exit, pointerEvents: 'none' },
  } satisfies Variants,
  initial: 'hidden',
  animate: 'visible',
  exit: 'exit',
} as const;

/** Variants for a dialog window, honouring the reduced-motion preference. */
export function useDialogWindowVariants(): Variants {
  return useReducedMotion() ? fadingWindowVariants : dialogWindowVariants;
}
