import { useCallback, useEffect, useState } from 'react';
import type { AssetService } from '../../../../services/AssetService';
import type { TagGroup } from '../../../../services/tagGroups';

interface AssetTags {
  tags: string[];
  createTag: (name: string) => Promise<string>;
  isCreatingTag: boolean;
}

/** Shared tag catalog and creation of one tag group for asset importers and scene creation. */
export function useAssetTags(assetService: AssetService | null, isOpen: boolean, collection: string, group: TagGroup): AssetTags {
  const [tags, setTags] = useState<string[]>([]);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  useEffect(() => {
    if (!assetService || !isOpen) return;
    let cancelled = false;
    assetService.getAllTags(group)
      .then((names) => { if (!cancelled) setTags(names); })
      .catch((error) => console.error('[AssetTags] Error loading tags:', error));
    return () => { cancelled = true; };
  }, [assetService, isOpen, group]);

  const createTag = useCallback(async (name: string): Promise<string> => {
    if (!assetService) throw new Error('Asset service is not ready');
    setIsCreatingTag(true);
    try {
      const tag = await assetService.createTag(collection, group, name.trim());
      setTags((previous) => Array.from(new Set([...previous, tag.name])).sort());
      return tag.name;
    } finally {
      setIsCreatingTag(false);
    }
  }, [assetService, collection, group]);

  return { tags, createTag, isCreatingTag };
}
