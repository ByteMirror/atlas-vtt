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

/** URL of the first image of `paths` that exists (e.g. a thumbnail, then the full art); null while none is known. */
export function useContentImage(media: ContentMedia, paths: ReadonlyArray<string | undefined>): string | null {
  const candidates = paths.filter((path): path is string => Boolean(path));
  const key = candidates.join('\n');
  const [url, setUrl] = useState<string | null>(() => immediateUrl(media, candidates) ?? null);
  useEffect(() => {
    const list = key ? key.split('\n') : [];
    const now = immediateUrl(media, list);
    if (now !== undefined) {
      setUrl(now);
      return undefined;
    }
    let cancelled = false;
    void firstUrl(media, list).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return (): void => { cancelled = true; };
  }, [media, key]);
  return url;
}
