import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImageIcon, Loader2, Save, Upload } from 'lucide-react';
import { Platform } from 'obsidian';
import { cn } from '../../../../utils/cn';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { TokenCreatorRail } from './token-creator/TokenCreatorRail';
import { TokenPreviewCard } from './token-creator/TokenPreviewCard';
import { saveTokenPreviews } from './token-creator/saveTokenPreviews';
import { useAssetCatalog } from './token-creator/useAssetCatalog';
import { useAssetTags } from './token-creator/useAssetTags';
import { useTokenPreviews } from './token-creator/useTokenPreviews';
import { modeNoun } from './token-creator/types';
import type { CreatorMode, EditTokenInput } from './token-creator/types';

interface TokenCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: CreatorMode;
  selectedCollection?: string;
  editToken?: EditTokenInput | null;
}

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

export function TokenCreator({ isOpen, onClose, mode = 'token', selectedCollection = 'default', editToken }: TokenCreatorProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const { assetService, collections } = useAssetCatalog(app, isOpen);
  const previews = useTokenPreviews(mode);

  const [collection, setCollection] = useState(selectedCollection);
  const { tags: availableTags, createTag, isCreatingTag } = useAssetTags(assetService, isOpen, collection);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);

  const { reset } = previews;
  const editTokenRef = useRef(editToken);
  editTokenRef.current = editToken;
  const editTokenId = editToken?.id;
  useEffect(() => {
    if (!isOpen) return;
    const token = editTokenRef.current;
    setCollection(selectedCollection);
    setSelectedTags(token?.tags ?? []);
    setIsSubmitting(false);
    reset(token);
    windowRef.current?.focus();
  }, [isOpen, editTokenId, selectedCollection, reset]);

  useEffect(() => {
    const first = collections[0];
    if (first && !collections.includes(collection)) setCollection(first);
  }, [collections, collection]);

  const handleFiles = useCallback((files: File[]): void => {
    if (editToken) {
      previews.reset(null);
      previews.addFiles(files.slice(0, 1));
      return;
    }
    previews.addFiles(files);
  }, [editToken, previews]);

  const canSubmit = previews.previews.length > 0 && !isSubmitting && !isCreatingTag && assetService !== null;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!canSubmit || !assetService || !app) return;
    setIsSubmitting(true);
    try {
      const saved = await saveTokenPreviews({
        app,
        assetService,
        mode,
        previews: previews.previews,
        collection,
        tags: selectedTags,
        editToken: editToken ?? null,
        waitForOptimized: previews.waitForOptimized,
      });
      if (saved > 0) {
        app.workspace.trigger('atlas-vtt:refresh-assets');
        onClose();
      }
    } catch (error) {
      console.error('[TokenCreator] Error saving:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [app, assetService, canSubmit, collection, editToken, mode, onClose, previews, selectedTags]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isShortcutScopeActive(windowRef.current)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, handleSubmit]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (): void => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  if (!isOpen) return null;

  const count = previews.previews.length;
  const noun = modeNoun(mode, count);
  const title = editToken ? `Edit ${modeNoun(mode, 1)}` : `Create ${modeNoun(mode, 2)}`;
  const isOptimizing = previews.previews.some((p) => p.isOptimizing);
  const submitLabel = editToken ? 'Update' : 'Create';

  return (
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-token-creator" data-token-creator="true" onClick={onClose}>
      <div
        ref={windowRef}
        className={cn('atlas-token-creator__window', isDragging && 'atlas-dragging')}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <TokenCreatorRail
          mode={mode}
          isEditing={Boolean(editToken)}
          isDragging={isDragging}
          previews={previews}
          onFiles={handleFiles}
          collection={collection}
          collections={collections}
          onCollectionChange={setCollection}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onCreateTag={createTag}
          tagsDisabled={!assetService || isSubmitting}
          onToggleTag={(tag) => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
        />

        <header className="atlas-token-creator__header">
          <h2>
            <span id={titleId}>{title}</span>
            {count > 0 && <span className="atlas-token-creator__subtitle">{count} {noun}</span>}
          </h2>
          <CloseButton onClick={onClose} />
        </header>

        <div className={cn('atlas-token-creator__previews', count === 0 && 'atlas-empty')}>
          {count === 0 ? (
            <div className="atlas-token-creator__empty">
              <div className="atlas-token-creator__empty-icon"><ImageIcon /></div>
              <h3>No {modeNoun(mode, 2)} yet</h3>
              <p>Drop images anywhere in this window. You can crop, zoom and name each one before creating.</p>
            </div>
          ) : (
            <div className="atlas-token-creator__grid">
              {previews.previews.map((preview, index) => (
                <TokenPreviewCard
                  key={preview.id}
                  preview={preview}
                  mode={mode}
                  index={index}
                  onChange={(patch) => previews.update(preview.id, patch)}
                  onToggleSelected={() => previews.toggleSelected(preview.id)}
                  onRemove={() => previews.remove(preview.id)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="atlas-token-creator__footer">
          <span className="atlas-token-creator__status">
            {isOptimizing && <Loader2 className="atlas-spin" />}
            {count === 0 ? `No ${modeNoun(mode, 2)} to create` : isOptimizing ? 'Optimizing images…' : `${count} ${noun} ready`}
          </span>
          <div className="atlas-token-creator__actions">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="default" size="sm" onClick={() => { void handleSubmit(); }} disabled={!canSubmit}>
              {isSubmitting ? <Loader2 className="atlas-spin" /> : <Save />}
              <span>{isSubmitting ? `${submitLabel.replace(/e$/, '')}ing…` : submitLabel}</span>
              {!isSubmitting && <kbd className="atlas-token-creator__kbd">{Platform.isMacOS ? '⌘' : 'Ctrl'}↵</kbd>}
            </Button>
          </div>
        </footer>

        {isDragging && (
          <div className="atlas-token-creator__drop-overlay">
            <div className="atlas-token-creator__drop-overlay-icon"><Upload /></div>
            <span>Drop to add {modeNoun(mode, 2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
