import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { optimizeUpload } from './tokenImages';
import type { CreatorMode, EditTokenInput, PreviewImage, TokenPreview, TokenPreviewPatch } from './types';
import { cropReset } from './cropMath';
import { useBatchProgress } from './useBatchProgress';
import type { ProgressCount } from '../../primitives/useLingeringTask';

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
  /** Resolves with the converted upload once background optimization for this preview settles. */
  waitForOptimized: (id: string) => Promise<ProcessedImage | undefined>;
  /** How far the conversion of the images added last is, or null when none runs. */
  optimization: ProgressCount | null;
}

function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

/** Cards show the converted image once it is ready, never the upload itself, which may be far too large to paint cheaply. */
function previewFromFile(file: File): TokenPreview {
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return {
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    file,
    previewUrl: '',
    name: baseName || 'Untitled',
    ...cropReset({ file }),
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
    ...cropReset({ file: null }),
    isSelected: true,
    isOptimizing: false,
  };
}

interface PendingOptimization {
  result: Promise<ProcessedImage | undefined>;
  controller: AbortController;
  settled: boolean;
}

/**
 * Owns the preview list of the token creator: file intake, background
 * optimization, selection and per-preview edits. Uploads are converted in
 * parallel by the image workers; removing a preview cancels its conversion.
 * Blob URLs are revoked when a preview is removed or on unmount.
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

  const pendingRef = useRef(new Map<string, PendingOptimization>());
  const { progress: optimization, start: startOptimizations, finish: finishOptimization, drop: dropOptimization, clear: clearOptimizations } = useBatchProgress();
  const cancelOptimization = useCallback((id: string): void => {
    const pending = pendingRef.current.get(id);
    pendingRef.current.delete(id);
    if (!pending || pending.settled) return;
    pending.controller.abort();
    dropOptimization();
  }, [dropOptimization]);
  const cancelAllOptimizations = useCallback((): void => {
    pendingRef.current.forEach(pending => pending.controller.abort());
    pendingRef.current.clear();
    clearOptimizations();
  }, [clearOptimizations]);

  useEffect(() => () => {
    cancelAllOptimizations();
    previewsRef.current.forEach(p => revokeIfBlob(p.previewUrl));
    previewsRef.current = [];
  }, [cancelAllOptimizations]);

  const patchPreview = useCallback((id: string, patch: Partial<TokenPreview>): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [changePreviews]);

  const optimizeOne = useCallback(async (preview: TokenPreview, signal: AbortSignal): Promise<ProcessedImage | undefined> => {
    if (!preview.file) return undefined;
    try {
      // The thumbnail is only saved from this result for maps and unframed tokens; framed ones are cropped at save.
      const thumbnail = mode === 'map' || preview.showRing === false;
      const result = await optimizeUpload(preview.file, mode, { signal, thumbnail, background: true });
      const stillPresent = previewsRef.current.some((p) => p.id === preview.id);
      if (!stillPresent) return result;
      patchPreview(preview.id, {
        compressionRatio: Math.round((1 - result.image.size / preview.file.size) * 100),
        previewUrl: URL.createObjectURL(result.preview ?? result.image),
        isOptimizing: false,
      });
      return result;
    } catch (error) {
      if (signal.aborted) return undefined;
      console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
      // Show the upload itself so the user can see which image failed.
      if (previewsRef.current.some((p) => p.id === preview.id)) {
        patchPreview(preview.id, { previewUrl: URL.createObjectURL(preview.file), isOptimizing: false });
      }
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
    startOptimizations(fresh.length);
    for (const preview of fresh) {
      const controller = new AbortController();
      const pending: PendingOptimization = { controller, settled: false, result: optimizeOne(preview, controller.signal) };
      void pending.result.finally(() => {
        pending.settled = true;
        if (!controller.signal.aborted) finishOptimization();
      });
      pendingRef.current.set(preview.id, pending);
    }
  }, [optimizeOne, defaultRing, changePreviews, startOptimizations, finishOptimization]);

  const reset = useCallback((editToken?: EditTokenInput | null): void => {
    previewsRef.current.forEach((p) => revokeIfBlob(p.previewUrl));
    cancelAllOptimizations();
    setDefaultRing(editToken?.showRing ?? true);
    changePreviews(() => editToken?.imageUrl ? [previewFromEdit(editToken)] : []);
  }, [changePreviews, cancelAllOptimizations]);

  const remove = useCallback((id: string): void => {
    changePreviews((prev) => {
      prev.filter((p) => p.id === id).forEach((p) => revokeIfBlob(p.previewUrl));
      return prev.filter((p) => p.id !== id);
    });
    cancelOptimization(id);
  }, [changePreviews, cancelOptimization]);

  const removeSelected = useCallback((): void => {
    changePreviews((prev) => {
      prev.filter((p) => p.isSelected).forEach((p) => {
        revokeIfBlob(p.previewUrl);
        cancelOptimization(p.id);
      });
      return prev.filter((p) => !p.isSelected);
    });
  }, [changePreviews, cancelOptimization]);

  const setAllSelected = useCallback((isSelected: boolean): void => {
    changePreviews((prev) => prev.map((p) => ({ ...p, isSelected })));
  }, [changePreviews]);

  const toggleSelected = useCallback((id: string): void => {
    changePreviews((prev) => prev.map((p) => (p.id === id ? { ...p, isSelected: !p.isSelected } : p)));
  }, [changePreviews]);

  const updateSelected = useCallback((patch: TokenPreviewPatch): void => {
    changePreviews((prev) => prev.map((p) => (p.isSelected ? { ...p, ...patch } : p)));
  }, [changePreviews]);

  const waitForOptimized = useCallback(async (id: string): Promise<ProcessedImage | undefined> => pendingRef.current.get(id)?.result, []);

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
    optimization,
  };
}
