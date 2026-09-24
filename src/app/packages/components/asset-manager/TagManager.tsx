import React, { useState, useRef, useEffect } from 'react';
import { Tag, FolderOpen, Search, Plus } from 'lucide-react';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import { confirmAction } from '../../../ui/confirmDialog';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { ManagedItemRow, type ManagedItem } from './components/ManagedItemRow';
import { useItemSelection } from './hooks/useItemSelection';

type ManagerTab = 'atlas-tags' | 'atlas-collections';

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  tags: readonly ManagedItem[];
  collections: readonly ManagedItem[];
  onCreateTag: (name: string) => void;
  onCreateCollection: (name: string) => void;
  onUpdateTag: (tagId: string, name: string) => void | Promise<void>;
  onUpdateCollection: (collectionId: string, name: string) => void | Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  onDeleteCollection: (collectionId: string) => Promise<void>;
}

const TagManager: React.FC<TagManagerProps> = ({
  isOpen,
  onClose,
  tags,
  collections,
  onCreateTag,
  onCreateCollection,
  onUpdateTag,
  onUpdateCollection,
  onDeleteTag,
  onDeleteCollection,
}) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('atlas-tags');
  const [searchValue, setSearchValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  const isTagsTab = activeTab === 'atlas-tags';
  const items = isTagsTab ? tags : collections;
  const createItem = isTagsTab ? onCreateTag : onCreateCollection;
  const updateItem = isTagsTab ? onUpdateTag : onUpdateCollection;
  const deleteItem = isTagsTab ? onDeleteTag : onDeleteCollection;
  const itemLabel = isTagsTab ? 'tags' : 'collections';
  const itemNoun = isTagsTab ? 'Tag' : 'Collection';

  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(searchValue.toLowerCase()));
  const selection = useItemSelection(filteredItems.map((item) => item.id));
  const { selectedIds } = selection;

  const nameTaken = (name: string, exceptId?: string): boolean =>
    items.some((item) => item.id !== exceptId && item.name.toLowerCase() === name.toLowerCase());
  const showCreateOption = searchValue && !nameTaken(searchValue);

  // Selection and editing belong to one tab: ids of tags and collections must never mix.
  const switchTab = (tab: ManagerTab): void => {
    setActiveTab(tab);
    selection.clear();
    setEditingId(null);
    setError('');
  };

  useEffect(() => {
    if (isOpen && !editingId) {
      modalRef.current?.focus();
    }
  }, [isOpen, editingId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen) return;
      if (!isShortcutScopeActive(modalRef.current)) return;

      if (e.key === 'Escape' && !editingId) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        switchTab('atlas-tags');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        switchTab('atlas-collections');
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selection.toggleAll();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const handleCreate = (): void => {
    if (!searchValue.trim()) return;
    if (nameTaken(searchValue.trim())) {
      setError(`${itemNoun} already exists`);
      return;
    }
    createItem(searchValue.trim());
    setSearchValue('');
    setError('');
  };

  const handleEdit = (item: ManagedItem): void => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const handleCancelEdit = (): void => {
    setEditingId(null);
    setEditValue('');
    setError('');
  };

  const handleSaveEdit = (): void => {
    const name = editValue.trim();
    if (!name) {
      setError('Name cannot be empty');
      return;
    }
    if (editingId && nameTaken(name, editingId)) {
      setError(`${itemNoun} already exists`);
      return;
    }
    if (editingId) void updateItem(editingId, name);
    handleCancelEdit();
  };

  const confirmDelete = async (targets: readonly ManagedItem[]): Promise<boolean> => {
    if (isTagsTab) return true;
    return confirmAction({
      title: targets.length === 1 ? `Delete collection "${targets[0]!.name}"?` : `Delete ${targets.length} collections?`,
      message: ['Every scene, map, token and encounter in it moves to the trash.'],
      confirmLabel: 'Delete',
      destructive: true,
    });
  };

  const deleteItems = async (targets: readonly ManagedItem[]): Promise<void> => {
    if (targets.length === 0 || !(await confirmDelete(targets))) return;
    for (const target of targets) await deleteItem(target.id);
    selection.clear();
  };

  const selectedItems = (): ManagedItem[] => items.filter((item) => selectedIds.has(item.id));

  const handleItemContextMenu = (item: ManagedItem, event: React.MouseEvent): void => {
    // A row outside the selection acts on its own; the menu must not target the old selection.
    const targets = selectedIds.has(item.id) ? selectedItems() : [item];
    if (!selectedIds.has(item.id)) selection.replace([item.id]);

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: 'Edit', icon: 'edit', onClick: () => handleEdit(item) },
      { type: 'separator' },
      {
        type: 'item',
        label: targets.length > 1 ? `Delete ${targets.length} items` : 'Delete',
        icon: 'trash',
        destructive: true,
        onClick: () => { void deleteItems(targets); },
      },
    ];

    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  if (!isOpen) return null;

  return (
    <div
      className="atlas-vtt-plugin atlas-vtt-root atlas-tag-manager-modal"
      onClick={(e) => {
        e.stopPropagation();
        // Only close if clicking the backdrop itself
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        ref={modalRef}
        className="atlas-tag-manager-content"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="atlas-tag-manager-header">
          <h2>Manage Tags & Collections</h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-tag-manager-tabs">
          <div className="atlas-tab-switcher">
            <button
              className={`atlas-tab-button ${isTagsTab ? 'atlas-active' : ''}`}
              onClick={() => switchTab('atlas-tags')}
            >
              <Tag size={16} />
              Tags
              <span className="atlas-tab-shortcut">⌘1</span>
            </button>
            <button
              className={`atlas-tab-button ${!isTagsTab ? 'atlas-active' : ''}`}
              onClick={() => switchTab('atlas-collections')}
            >
              <FolderOpen size={16} />
              Collections
              <span className="atlas-tab-shortcut">⌘2</span>
            </button>
          </div>
        </div>

        <div className="atlas-tag-manager-body">
          <div className="atlas-search-section">
            <div className="atlas-search-input-wrapper">
              <Search size={16} className="atlas-search-icon" />
              <input
                type="text"
                placeholder={`Search or create ${itemLabel}…`}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreateOption) {
                    handleCreate();
                  }
                }}
                className="atlas-search-input"
              />
            </div>
          </div>

          {error && (
            <div className="atlas-error-message">
              {error}
            </div>
          )}

          <div className="atlas-items-list">
            {showCreateOption && (
              <div className="atlas-create-item" onClick={handleCreate}>
                <Plus size={16} />
                Create "{searchValue}"
              </div>
            )}

            {filteredItems.map((item) => (
              <ManagedItemRow
                key={item.id}
                item={item}
                kind={isTagsTab ? 'tag' : 'collection'}
                isSelected={selectedIds.has(item.id)}
                editValue={editingId === item.id ? editValue : null}
                onEditValueChange={setEditValue}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onSelect={(range) => selection.select(item.id, range)}
                onOpenMenu={(e) => handleItemContextMenu(item, e)}
              />
            ))}

            {filteredItems.length === 0 && !showCreateOption && (
              <div className="atlas-empty-state">
                No {itemLabel} found
              </div>
            )}
          </div>
        </div>

        <div className="atlas-tag-manager-footer">
          {selectedIds.size > 0 && (
            <>
              <span className="atlas-selected-count">{selectedIds.size} selected</span>
              <Button variant="destructive" size="sm" onClick={() => { void deleteItems(selectedItems()); }}>
                Delete selected
              </Button>
            </>
          )}
          <Button variant="default" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
};

export default TagManager;
