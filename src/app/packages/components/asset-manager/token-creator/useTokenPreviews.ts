import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { optimizeImage, OPTIMIZATION_PRESETS } from '../../../../utils/imageOptimizer';
import type { CreatorMode, EditTokenInput, TokenPreview, TokenPreviewPatch } from './types';

export interface TokenPreviewsApi {
  previews: TokenPreview[];
  defaultRing: boolean;
  setAllRings: (showRing: boolean) => void;
  selectedIds: string[];
  addFiles: (files: File[]) => void;
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
    showRing: token.showRing ?? true,
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
  previewsRef.current = previews;

  const pendingRef = useRef(new Map<string, Promise<Blob | undefined>>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => () => previewsRef.current.forEach((p) => revokeIfBlob(p.previewUrl)), []);

  const patchPreview = useCallback((id: string, patch: Partial<TokenPreview>): void => {
    setPreviews((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const optimizeOne = useCallback(async (preview: TokenPreview): Promise<Blob | undefined> => {
    if (!preview.file) return undefined;
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

  const addFiles = useCallback((files: File[]): void => {
    const fresh = files.filter((f) => f.type.startsWith('image/')).map(file => ({ ...previewFromFile(file), showRing: defaultRing }));
    if (fresh.length === 0) return;
    setPreviews((prev) => [...prev, ...fresh]);
    for (const preview of fresh) {
      const task = queueRef.current.then(() => optimizeOne(preview));
      pendingRef.current.set(preview.id, task);
      queueRef.current = task;
    }
  }, [optimizeOne, defaultRing]);

  const reset = useCallback((editToken?: EditTokenInput | null): void => {
    previewsRef.current.forEach((p) => revokeIfBlob(p.previewUrl));
    pendingRef.current.clear();
    setPreviews(editToken?.imageUrl ? [previewFromEdit(editToken)] : []);
  }, []);

  const remove = useCallback((id: string): void => {
    setPreviews((prev) => {
      prev.filter((p) => p.id === id).forEach((p) => revokeIfBlob(p.previewUrl));
      return prev.filter((p) => p.id !== id);
    });
    pendingRef.current.delete(id);
  }, []);

  const removeSelected = useCallback((): void => {
    setPreviews((prev) => {
      prev.filter((p) => p.isSelected).forEach((p) => {
        revokeIfBlob(p.previewUrl);
        pendingRef.current.delete(p.id);
      });
      return prev.filter((p) => !p.isSelected);
    });
  }, []);

  const setAllSelected = useCallback((isSelected: boolean): void => {
    setPreviews((prev) => prev.map((p) => ({ ...p, isSelected })));
  }, []);

  const toggleSelected = useCallback((id: string): void => {
    setPreviews((prev) => prev.map((p) => (p.id === id ? { ...p, isSelected: !p.isSelected } : p)));
  }, []);

  const updateSelected = useCallback((patch: TokenPreviewPatch): void => {
    setPreviews((prev) => prev.map((p) => (p.isSelected ? { ...p, ...patch } : p)));
  }, []);

  const waitForOptimized = useCallback(async (id: string): Promise<Blob | undefined> => {
    const pending = pendingRef.current.get(id);
    if (pending) return pending;
    return previewsRef.current.find((p) => p.id === id)?.optimizedFile;
  }, []);

  const selectedIds = useMemo(() => previews.filter((p) => p.isSelected).map((p) => p.id), [previews]);

  return {
    previews,
    defaultRing,
    setAllRings: (showRing) => { setDefaultRing(showRing); setPreviews(current => current.map(p => ({ ...p, showRing }))); },
    selectedIds,
    addFiles,
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
