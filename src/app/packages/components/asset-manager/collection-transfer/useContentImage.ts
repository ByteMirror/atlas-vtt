import { useEffect, useState } from 'react';
import type { ContentMedia } from './contentMedia';

/** The first of `paths` that resolves, or undefined when it has to wait for one to be unpacked. */
function immediateUrl(media: ContentMedia, paths: readonly string[]): string | null | undefined {
  for (const path of paths) {
    const url = media.imageUrl(path);
    if (typeof url === 'string') return url;
    if (url !== null) return undefined;
  }
  return null;
}

async function firstUrl(media: ContentMedia, paths: readonly string[]): Promise<string | null> {
  for (const path of paths) {
    const url = await media.imageUrl(path);
    if (url) return url;
  }
  return null;
}

export interface ContentImage {
  /** URL of the image; null when there is none, or none yet. */
  url: string | null;
  /** The image is being unpacked: its place shows a placeholder that is still waiting. */
  pending: boolean;
}

const NO_IMAGE: ContentImage = { url: null, pending: false };
const UNPACKING: ContentImage = { url: null, pending: true };

function contentImage(url: string | null | undefined): ContentImage {
  if (url === undefined) return UNPACKING;
  return url === null ? NO_IMAGE : { url, pending: false };
}

function sameImage(a: ContentImage, b: ContentImage): boolean {
  return a.url === b.url && a.pending === b.pending;
}

/** The first image of `paths` that exists (e.g. a thumbnail, then the full art). */
export function useContentImage(media: ContentMedia, paths: ReadonlyArray<string | undefined>): ContentImage {
  const candidates = paths.filter((path): path is string => Boolean(path));
  const key = candidates.join('\n');
  const [image, setImage] = useState<ContentImage>(() => contentImage(immediateUrl(media, candidates)));
  useEffect(() => {
    const list = key ? key.split('\n') : [];
    const now = immediateUrl(media, list);
    const known = contentImage(now);
    setImage((current) => (sameImage(current, known) ? current : known));
    if (now !== undefined) return undefined;
    let cancelled = false;
    void firstUrl(media, list).then((next) => {
      if (!cancelled) setImage(contentImage(next));
    });
    return (): void => { cancelled = true; };
  }, [media, key]);
  return image;
}
