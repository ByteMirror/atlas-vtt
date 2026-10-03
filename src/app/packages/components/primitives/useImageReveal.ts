import type * as React from 'react';
import { useCallback, useState } from 'react';
import { skeletonPhaseStyle } from './skeletonPhase';

/** Sources remembered before the list starts over; far more than a session shows. */
const MAX_REMEMBERED = 8000;

/** Images this window has shown: their next mount paints at once, from the browser's memory. */
const shownSources = new Set<string>();

function remember(src: string): void {
  if (shownSources.size >= MAX_REMEMBERED) shownSources.clear();
  shownSources.add(src);
}

export type ImageRevealStatus = 'pending' | 'shown' | 'failed';

export interface ImageReveal {
  status: ImageRevealStatus;
  /**
   * Whether the image was not known when it was first rendered, so a
   * placeholder stood in for it and it fades in. An image seen before shows as
   * it is: scrolling back to a card neither flashes a placeholder nor fades.
   */
  fresh: boolean;
  /** For the `<img>`. */
  imageProps: {
    ref: (image: HTMLImageElement | null) => void;
    onLoad: () => void;
    onError: () => void;
    'data-shown': true | undefined;
  };
  /** For the placeholder: starts its breath in step with every other one. */
  placeholderStyle: React.CSSProperties | undefined;
}

interface RevealState {
  src: string;
  status: ImageRevealStatus;
  fresh: boolean;
  placeholderStyle: React.CSSProperties | undefined;
}

function initialState(src: string): RevealState {
  const known = shownSources.has(src);
  return {
    src,
    status: known ? 'shown' : 'pending',
    fresh: !known,
    placeholderStyle: known ? undefined : skeletonPhaseStyle(),
  };
}

/**
 * Follows an image from its request to its first paint, so a placeholder can
 * hold its place and the image can fade in over it (`atlas-image-reveal`).
 */
export function useImageReveal(src: string): ImageReveal {
  const [stored, setStored] = useState(() => initialState(src));
  let state = stored;
  if (stored.src !== src) {
    state = initialState(src);
    setStored(state);
  }

  const settle = useCallback((status: ImageRevealStatus): void => {
    if (status === 'shown') remember(src);
    setStored((current) => (current.src === src && current.status !== status ? { ...current, status } : current));
  }, [src]);

  // An image the browser already holds is complete before its load event could be heard.
  const ref = useCallback((image: HTMLImageElement | null): void => {
    if (image?.complete && image.naturalWidth > 0) settle('shown');
  }, [settle]);
  const onLoad = useCallback((): void => settle('shown'), [settle]);
  const onError = useCallback((): void => settle('failed'), [settle]);

  return {
    status: state.status,
    fresh: state.fresh,
    imageProps: { ref, onLoad, onError, 'data-shown': state.status === 'shown' ? true : undefined },
    placeholderStyle: state.placeholderStyle,
  };
}
