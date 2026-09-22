import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { optimizeImage, OPTIMIZATION_PRESETS } from '../../../../utils/imageOptimizer';
import type { CreatorMode, EditTokenInput, PreviewImage, TokenPreview, TokenPreviewPatch } from './types';

export interface TokenPreviewsApi {
  previews: TokenPreview[];
  defaultRing: boolean;
  setAllRings: (showRing: boolean) => void;
  selectedIds: string[];
  addFiles: (files: File[]) => void;
  addImages: (images: PreviewImage[]) => void;
  toggleTag: (tag: string) => void;
  reset: (editToken?: EditTokenInput | null) => void;
  remove: (id: string) => void;
  removeSelected: () => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelected: (id: string) => void;
  update: (id: string, patch: TokenPreviewPatch) => void;
  updateSelected: (patch: TokenPreviewPatch) => void;
  /** Resolves with the optimized blob once background optimization for this preview settles. */
  waitForOptimized: (id: string) => Promise<Blob | undefined>;
}

function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function previewFromFile(file: File): TokenPreview {
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return {
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    name: baseName || 'Untitled',
    imageScale: 1,
    imagePosition: { x: 0, y: 0 },
    isSelected: true,
    isOptimizing: true,
  };
}

function previewFromEdit(token: EditTokenInput): TokenPreview {
  return {
    id: token.id,
    tags: token.tags,
    showRing: token.showRing ?? true,
    ...(token.size !== undefined && { size: token.size }),
    file: null,
    previewUrl: token.imageUrl,
    name: token.name,
    imageScale: 1,
    imagePosition: { x: 0, y: 0 },
    isSelected: true,
    isOptimizing: false,
  };
}

/**
 * Owns the preview list of the token creator: file intake, background
 * optimization, selection and per-preview edits. Blob URLs are revoked when a
 * preview is removed, replaced by its optimized version, or on unmount.
 */
export function useTokenPreviews(mode: CreatorMode): TokenPreviewsApi {
  const [defaultRing, setDefaultRing] = useState(true);
  const [previews, setPreviews] = useState<TokenPreview[]>([]);
  const previewsRef = useRef(previews);
  const changePreviews = useCallback((update: (current: TokenPreview[]) => TokenPreview[]): void => {
    const next = update(previewsRef.current);
    previewsRef.current = next;
    setPreviews(next);
  }, []);

  const pendingRef = useRef(new Map<string, Promise<Blob | undefined>>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => () => {
    previewsRef.current.forEach(p => revokeIfBlob(p.previewUrl));
    previewsRef.current = [];
  }, []);

  const patchPreview = useCallback((id: string, patch: Partial<TokenPreview>): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [changePreviews]);

  const optimizeOne = useCallback(async (preview: TokenPreview): Promise<Blob | undefined> => {
    if (!preview.file || !previewsRef.current.some(p => p.id === preview.id)) return undefined;
    try {
      const result = await optimizeImage(preview.file, OPTIMIZATION_PRESETS[mode]);
      const stillPresent = previewsRef.current.some((p) => p.id === preview.id);
      if (!stillPresent) return result.blob;
      revokeIfBlob(preview.previewUrl);
      patchPreview(preview.id, {
        optimizedFile: result.blob,
        previewUrl: URL.createObjectURL(result.blob),
        optimizationResult: result,
        isOptimizing: false,
      });
      return result.blob;
    } catch (error) {
      console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
      patchPreview(preview.id, { isOptimizing: false });
      return undefined;
    }
  }, [mode, patchPreview]);

  const addImages = useCallback((images: PreviewImage[]): void => {
    const paths = new Set(previewsRef.current.flatMap(p => p.statblockPath ? [p.statblockPath] : []));
    const fresh = images.filter(image => {
      if (!image.file.type.startsWith('image/') || (image.statblockPath && paths.has(image.statblockPath))) return false;
      if (image.statblockPath) paths.add(image.statblockPath);
      return true;
    }).map(image => ({ ...previewFromFile(image.file), ...image, tags: image.tags ?? [], showRing: image.showRing ?? defaultRing }));
    if (fresh.length === 0) return;
    changePreviews((prev) => [...prev, ...fresh]);
    for (const preview of fresh) {
      const task = queueRef.current.then(() => optimizeOne(preview));
      pendingRef.current.set(preview.id, task);
      queueRef.current = task;
    }
  }, [optimizeOne, defaultRing, changePreviews]);

  const reset = useCallback((editToken?: EditTokenInput | null): void => {
    previewsRef.current.forEach((p) => revokeIfBlob(p.previewUrl));
    pendingRef.current.clear();
    setDefaultRing(editToken?.showRing ?? true);
    changePreviews(() => editToken?.imageUrl ? [previewFromEdit(editToken)] : []);
  }, [changePreviews]);

  const remove = useCallback((id: string): void => {
    changePreviews((prev) => {
      prev.filter((p) => p.id === id).forEach((p) => revokeIfBlob(p.previewUrl));
      return prev.filter((p) => p.id !== id);
    });
    pendingRef.current.delete(id);
  }, [changePreviews]);

  const removeSelected = useCallback((): void => {
    changePreviews((prev) => {
      prev.filter((p) => p.isSelected).forEach((p) => {
        revokeIfBlob(p.previewUrl);
        pendingRef.current.delete(p.id);
      });
      return prev.filter((p) => !p.isSelected);
    });
  }, [changePreviews]);

  const setAllSelected = useCallback((isSelected: boolean): void => {
    changePreviews((prev) => prev.map((p) => ({ ...p, isSelected })));
  }, [changePreviews]);

  const toggleSelected = useCallback((id: string): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? { ...p, isSelected: !p.isSelected } : p)));
  }, [changePreviews]);

  const updateSelected = useCallback((patch: TokenPreviewPatch): void => {
    changePreviews((prev) => prev.map((p) => (p.isSelected ? { ...p, ...patch } : p)));
  }, [changePreviews]);

  const waitForOptimized = useCallback(async (id: string): Promise<Blob | undefined> => {
    const pending = pendingRef.current.get(id);
    if (pending) return pending;
    return previewsRef.current.find((p) => p.id === id)?.optimizedFile;
  }, []);

  const selectedIds = useMemo(() => previews.filter((p) => p.isSelected).map((p) => p.id), [previews]);

  return {
    previews,
    defaultRing,
    setAllRings: (showRing) => { setDefaultRing(showRing); changePreviews(current => current.map(p => ({ ...p, showRing }))); },
    selectedIds,
    addFiles: files => addImages(files.map(file => ({ file }))),
    addImages,
    toggleTag: tag => changePreviews(current => {
      const remove = current.filter(p => p.isSelected).every(p => p.tags?.includes(tag));
      return current.map(p => p.isSelected ? { ...p, tags: remove ? (p.tags ?? []).filter(t => t !== tag) : [...new Set([...(p.tags ?? []), tag])] } : p);
    }),
    reset,
    remove,
    removeSelected,
    selectAll: () => setAllSelected(true),
    deselectAll: () => setAllSelected(false),
    toggleSelected,
    update: patchPreview,
    updateSelected,
    waitForOptimized,
  };
}
