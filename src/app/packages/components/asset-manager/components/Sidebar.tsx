import React, { useState, useRef, useEffect } from 'react';
import {
  Search, X, Folder, Settings, ChevronDown, Check, Tag,
  Download, Upload,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { AnyAsset, Tag as TagType } from '../types';
import { hasAssetTag } from '../utils/assetTags';

export interface SidebarProps {
  selectedTagIds: string[];
  onSelectTag: (tagId: string) => void;
  tags: TagType[];
  assets: AnyAsset[];
  collections: string[];
  selectedCollection: string | null;
  onSelectCollection: (collection: string | null) => void;
  onManageTags: () => void;
  onEditCollectionSettings?: (collectionName: string) => void;
  onExportCollection?: () => void;
  onImportCollection?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  selectedTagIds,
  onSelectTag,
  tags,
  assets,
  collections,
  selectedCollection,
  onSelectCollection,
  onManageTags,
  onEditCollectionSettings,
  onExportCollection,
  onImportCollection,
  isCollapsed,
}: SidebarProps): React.JSX.Element {
  const [isCollectionDropdownOpen, setIsCollectionDropdownOpen] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const collectionDropdownRef = useRef<HTMLDivElement>(null);

  const [isTagsSearchVisible, setIsTagsSearchVisible] = useState(false);
  const [tagsSearchQuery, setTagsSearchQuery] = useState('');
  const tagsSearchInputRef = useRef<HTMLInputElement>(null);

  const [isTemporarilyExpanded, setIsTemporarilyExpanded] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const filteredCollections = collections.filter((c) =>
    c.toLowerCase().includes(collectionSearchQuery.toLowerCase())
  );

  const filteredTags = tagsSearchQuery
    ? tags.filter((t) => t.name.toLowerCase().includes(tagsSearchQuery.toLowerCase()))
    : tags;

  useEffect(() => {
    if (!isCollectionDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(event.target as Node)) {
        setIsCollectionDropdownOpen(false);
        setCollectionSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCollectionDropdownOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleCollectionSelect = (collection: string | null): void => {
    onSelectCollection(collection);
    setIsCollectionDropdownOpen(false);
    setCollectionSearchQuery('');
  };

  const handleSidebarMouseEnter = (): void => {
    if (isCollapsed && !isTemporarilyExpanded) {
      hoverTimeoutRef.current = window.setTimeout(() => setIsTemporarilyExpanded(true), 100);
    }
  };

  const handleSidebarMouseLeave = (): void => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (isCollapsed && isTemporarilyExpanded) {
      setIsTemporarilyExpanded(false);
    }
  };

  const toggleTagSearch = (): void => {
    const next = !isTagsSearchVisible;
    setIsTagsSearchVisible(next);
    if (next) {
      window.setTimeout(() => tagsSearchInputRef.current?.focus(), 100);
    } else {
      setTagsSearchQuery('');
    }
  };

  const renderCollectionOption = (collection: string | null, label: string): React.JSX.Element => (
    <button
      key={collection ?? '__all__'}
      type="button"
      className={`atlas-collection-option ${selectedCollection === collection ? 'atlas-selected' : ''}`}
      onClick={() => handleCollectionSelect(collection)}
    >
      <div className="atlas-collection-option-content">
        <Folder className="atlas-collection-option-icon" />
        <span className="atlas-collection-option-text">{label}</span>
      </div>
      <Check className="atlas-collection-check" />
    </button>
  );

  return (
    <>
      {isCollapsed && !isTemporarilyExpanded && (
        <div className="atlas-sidebar-hover-zone" onMouseEnter={handleSidebarMouseEnter} />
      )}
      <aside
        className={`atlas-asset-manager-sidebar ${isCollapsed ? 'atlas-collapsed' : ''} ${isTemporarilyExpanded ? 'atlas-expanded' : ''}`}
        onMouseEnter={isTemporarilyExpanded ? undefined : handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <div className="atlas-asset-manager-sidebar-content">
          <div className="atlas-collections">
            <div className="atlas-collections-heading-row">
              <div className="atlas-section-title">Collection</div>
              <div className="atlas-collections-heading-actions">
                {selectedCollection && onExportCollection && (
                  <LabelTooltip label="Export collection">
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onExportCollection}>
                      <Download />
                    </Button>
                  </LabelTooltip>
                )}
                {onImportCollection && (
                  <LabelTooltip label="Import collection">
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onImportCollection}>
                      <Upload />
                    </Button>
                  </LabelTooltip>
                )}
              </div>
            </div>

            <div className="atlas-collection-row">
              <div className={`atlas-collection-dropdown ${isCollectionDropdownOpen ? 'atlas-open' : ''}`} ref={collectionDropdownRef}>
                <button
                  type="button"
                  className={`atlas-collection-dropdown-trigger ${isCollectionDropdownOpen ? 'atlas-open' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setIsCollectionDropdownOpen(!isCollectionDropdownOpen); setCollectionSearchQuery(''); }}
                  aria-haspopup="listbox"
                  aria-expanded={isCollectionDropdownOpen}
                >
                  <span className="atlas-collection-selected">
                    <Folder />
                    <span>{selectedCollection || 'All Collections'}</span>
                  </span>
                  <ChevronDown className={`atlas-collection-chevron ${isCollectionDropdownOpen ? 'atlas-rotated' : ''}`} />
                </button>

                {isCollectionDropdownOpen && (
                  <div className="atlas-collection-dropdown-content" role="listbox">
                    <div className="atlas-collection-search">
                      <Search className="atlas-collection-search-icon" />
                      <input
                        type="text"
                        placeholder="Search collections…"
                        value={collectionSearchQuery}
                        onChange={(e) => setCollectionSearchQuery(e.target.value)}
                        className="atlas-collection-search-input"
                        autoFocus
                      />
                    </div>
                    <div className="atlas-collection-options">
                      {renderCollectionOption(null, 'All Collections')}
                      {filteredCollections.map((collection) => renderCollectionOption(collection, collection))}
                      {filteredCollections.length === 0 && collectionSearchQuery && (
                        <div className="atlas-collection-no-results">No collections found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedCollection && onEditCollectionSettings && (
                <LabelTooltip label="Collection settings">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-collection-header-btn"
                    onClick={(e) => { e.stopPropagation(); onEditCollectionSettings(selectedCollection); }}
                  >
                    <Settings />
                  </Button>
                </LabelTooltip>
              )}
            </div>
          </div>

          <div className="atlas-tags">
            <div className="atlas-tags-header">
              <div className="atlas-section-title">Tags</div>
              <LabelTooltip label="Search tags">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTagSearch}
                  className={`atlas-collection-header-btn ${isTagsSearchVisible ? 'atlas-active' : ''}`}
                >
                  <Search />
                </Button>
              </LabelTooltip>
            </div>

            {isTagsSearchVisible && (
              <div className="atlas-tags-search-container">
                <Search className="atlas-tags-search-icon" />
                <input
                  ref={tagsSearchInputRef}
                  type="text"
                  placeholder="Search tags…"
                  value={tagsSearchQuery}
                  onChange={(e) => setTagsSearchQuery(e.target.value)}
                  className="atlas-tags-search-input"
                />
                {tagsSearchQuery && (
                  <LabelTooltip label="Clear search">
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => setTagsSearchQuery('')}>
                      <X />
                    </Button>
                  </LabelTooltip>
                )}
              </div>
            )}

            <div className="atlas-tags-list">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => {
                  const tagCount = assets.filter((asset) => hasAssetTag(asset.tags, tag)).length;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`atlas-tag-button ${selectedTagIds.includes(tag.id) ? 'atlas-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onSelectTag(tag.id); }}
                      aria-pressed={selectedTagIds.includes(tag.id)}
                    >
                      <Tag className="atlas-tag-icon" />
                      <span className="atlas-tag-text">{tag.name}</span>
                      {tagCount > 0 && <span className="atlas-tag-count">{tagCount}</span>}
                    </button>
                  );
                })
              ) : (
                <div className="atlas-tags-empty">
                  <span className="atlas-tags-empty-text">
                    {tagsSearchQuery ? 'No matching tags' : 'No tags yet'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="atlas-sidebar-spacer" />

          <Button
            variant="ghost"
            className="atlas-asset-manager-manage-btn"
            onClick={(e) => { e.stopPropagation(); onManageTags(); }}
          >
            <Settings />
            <span>Manage tags</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
