import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from 'obsidian';
import { Search, Check, Plus, Minus, Tag as TagIcon } from 'lucide-react';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import type { AnyAsset, Tag } from './types';

interface TagSearchModalProps {
  selectedAssets: AnyAsset[];
  availableTags: Tag[];
  allAssets: AnyAsset[];
  onToggleTag: (tagId: string, selectedAssets: AnyAsset[]) => void;
  onCreateTag: (tagName: string) => void;
  onClose: () => void;
}

function TagSearchModalInner({
  selectedAssets: initialAssets,
  availableTags,
  allAssets,
  onToggleTag,
  onCreateTag,
  onClose,
}: TagSearchModalProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState(initialAssets);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Tag usage counts
  const tagUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    availableTags.forEach(tag => {
      map.set(tag.id, allAssets.filter(a => (a.tags || []).includes(tag.id)).length);
    });
    return map;
  }, [availableTags, allAssets]);

  // Filtered + sorted tags
  const sortedTags = useMemo(() => {
    const filtered = searchQuery
      ? availableTags.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : availableTags;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableTags, searchQuery]);

  const canCreate = searchQuery.trim() &&
    !availableTags.some(t => t.name.toLowerCase() === searchQuery.trim().toLowerCase());

  const handleToggleTag = (tagId: string): void => {
    onToggleTag(tagId, assets);
    // Update local asset state so the UI reflects the toggle immediately
    setAssets(prev =>
      prev.map(asset => {
        const current = asset.tags || [];
        const has = current.includes(tagId);
        return { ...asset, tags: has ? current.filter((t) => t !== tagId) : [...current, tagId] };
      }),
    );
  };

  const handleCreate = (): void => {
    const name = searchQuery.trim();
    if (!name) return;
    onCreateTag(name);
    setSearchQuery('');
    onClose();
  };

  return (
    <div
      className="atlas-modal-overlay"
      onClick={onClose}
      // This separate React root must not trigger the asset manager's outside-click listener.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="atlas-modal atlas-tag-search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="atlas-modal-header">
          <div>
            <h3>Manage Tags</h3>
            <span className="atlas-tag-search__subtitle">
              {assets.length} asset{assets.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {/* Search */}
        <div className="atlas-tag-search__search">
          <Search size={16} className="atlas-tag-search__search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="atlas-input"
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) handleCreate();
            }}
          />
        </div>

        {/* Tag list */}
        <div className="atlas-tag-search__list">
          {sortedTags.map((tag) => {
            const allHave = assets.every(a => (a.tags || []).includes(tag.id));
            const someHave = assets.some(a => (a.tags || []).includes(tag.id));
            const count = tagUsageMap.get(tag.id) || 0;

            return (
              <div
                key={tag.id}
                className={`atlas-tag-search__item ${allHave ? 'atlas-tag-search__item--selected' : someHave ? 'atlas-tag-search__item--partial' : ''}`}
                onClick={() => handleToggleTag(tag.id)}
              >
                <div className="atlas-tag-search__item-icon">
                  {allHave ? <Check size={16} /> : someHave ? <Minus size={16} /> : <Plus size={16} />}
                </div>
                <TagIcon size={14} className="atlas-tag-search__item-tag-icon" />
                <span className="atlas-tag-search__item-name">{tag.name}</span>
                {count > 0 && (
                  <span className="atlas-tag-search__item-count">{count}</span>
                )}
              </div>
            );
          })}

          {canCreate && (
            <div className="atlas-tag-search__create" onClick={handleCreate}>
              <Plus size={16} />
              <span>Create &ldquo;{searchQuery.trim()}&rdquo;</span>
            </div>
          )}

          {sortedTags.length === 0 && !canCreate && (
            <div className="atlas-tag-search__empty">
              {searchQuery ? 'No matching tags found' : 'No tags available'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Obsidian-compatible wrapper.
 * Keeps the same `new TagSearchModal(app, props).open()` API
 * but renders a React modal via createRoot instead of Obsidian's Modal chrome.
 */
export class TagSearchModal {
  private container: HTMLDivElement | null = null;
  private root: ReturnType<typeof createRoot> | null = null;
  private props: Omit<TagSearchModalProps, 'onClose'>;

  constructor(_app: App, props: Omit<TagSearchModalProps, 'onClose'>) {
    this.props = props;
  }

  open(): void {
    this.container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

    this.root = createRoot(this.container);
    this.root.render(
      <TagSearchModalInner
        {...this.props}
        onClose={() => this.close()}
      />,
    );
  }

  close(): void {
    this.root?.unmount();
    this.container?.remove();
    this.root = null;
    this.container = null;
  }
}
