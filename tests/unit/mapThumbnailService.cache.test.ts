import { describe, expect, test } from 'vitest';

import { MapThumbnailService } from '../../src/app/services/MapThumbnailService';

describe('MapThumbnailService cache', () => {
  test('evicts older thumbnails when the cache grows beyond the limit', () => {
    const service = new MapThumbnailService({} as any);

    for (let index = 0; index < 12; index++) {
      (service as any).rememberThumbnail(`map-${index}.atlasmap`, `data:${index}`);
    }

    const cache = (service as any).thumbnailCache as Map<string, string>;

    expect(cache.size).toBeLessThanOrEqual(8);
    expect(cache.has('map-0.atlasmap')).toBe(false);
    expect(cache.has('map-11.atlasmap')).toBe(true);
  });
});
