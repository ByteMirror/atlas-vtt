import { MOTION_EASE_OUT, MOTION_NORMAL_MS, MOTION_SLOW_MS, prefersReducedMotion } from '../utils/motion';

/** Images grow into place from slightly smaller, never from nothing. */
const ENTER_SCALE = 0.96;
/** Leaving images shrink only a little: the fade carries the exit. */
const EXIT_SCALE = 0.98;

/**
 * Shows an image overlay: the scrim fades in and the image grows into place.
 * When `replacing`, the scrim is already dark (the previous image leaves above it),
 * so only the image enters. The entrance waits on its first frame until `image` is
 * decoded, otherwise a large image would pop in partway through. Resolves when it starts.
 */
export async function playImageEnter(
  container: HTMLElement,
  stage: HTMLElement,
  image: HTMLImageElement,
  replacing: boolean,
): Promise<void> {
  const timing: KeyframeAnimationOptions = { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT };
  const from: Keyframe = prefersReducedMotion(stage) ? { opacity: 0 } : { opacity: 0, transform: `scale(${ENTER_SCALE})` };
  const entrance = [stage.animate([from, { opacity: 1, transform: 'none' }], timing)];
  if (!replacing) entrance.push(container.animate([{ opacity: 0 }, { opacity: 1 }], timing));
  // A paused animation keeps showing its first keyframe
  for (const animation of entrance) animation.pause();
  await image.decode().catch(() => undefined);
  for (const animation of entrance) animation.play();
}

/**
 * Fades an image overlay out, starting from wherever its entrance currently is,
 * so closing mid-entrance never jumps. Resolves once it is invisible.
 */
export async function playImageExit(container: HTMLElement, stage: HTMLElement): Promise<void> {
  const timing: KeyframeAnimationOptions = { duration: MOTION_NORMAL_MS, easing: MOTION_EASE_OUT, fill: 'forwards' };
  // Single keyframes start from the current animated value
  const fade = container.animate({ opacity: 0 }, timing);
  if (!prefersReducedMotion(stage)) stage.animate({ transform: `scale(${EXIT_SCALE})` }, timing);
  await fade.finished.catch(() => undefined);
}
