import React, { useState, useRef, useEffect } from 'react';
import { Tag, FolderOpen, Search, Plus, MoreVertical, Check, X } from 'lucide-react';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import { confirmAction } from '../../../ui/confirmDialog';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { LabelTooltip } from '../primitives/tooltip';

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  tags: string[];
  collections: string[];
  onCreateTag: (tag: string) => void;
  onCreateCollection: (collection: string) => void;
  onUpdateTag: (oldTag: string, newTag: string) => void;
  onUpdateCollection: (oldCollection: string, newCollection: string) => void | Promise<void>;
  onDeleteTag: (tag: string) => Promise<void>;
  onDeleteCollection: (collection: string) => Promise<void>;
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
  const [activeTab, setActiveTab] = useState<'atlas-tags' | 'atlas-collections'>('atlas-tags');
  const [searchValue, setSearchValue] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  const editInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const items = activeTab === 'atlas-tags' ? tags : collections;
  const createItem = activeTab === 'atlas-tags' ? onCreateTag : onCreateCollection;
  const updateItem = activeTab === 'atlas-tags' ? onUpdateTag : onUpdateCollection;
  const deleteItem = activeTab === 'atlas-tags' ? onDeleteTag : onDeleteCollection;

  const filteredItems = items.filter(item =>
    item.toLowerCase().includes(searchValue.toLowerCase())
  );

  const showCreateOption = searchValue && !items.some(item =>
    item.toLowerCase() === searchValue.toLowerCase()
  );

  useEffect(() => {
    if (editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingItem]);

  useEffect(() => {
    if (isOpen && !editingItem) {
      modalRef.current?.focus();
    }
  }, [isOpen, editingItem]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (!isShortcutScopeActive(modalRef.current)) return;
      
      if (e.key === 'Escape' && !editingItem) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setActiveTab('atlas-tags');
      } else if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('atlas-collections');
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        // Select all visible items
        if (filteredItems.length === selectedItems.size) {
          // If all are selected, deselect all
          setSelectedItems(new Set());
        } else {
          // Select all
          setSelectedItems(new Set(filteredItems));
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingItem, onClose, filteredItems, selectedItems.size]);


  const handleCreate = () => {
    if (!searchValue.trim()) return;
    
    if (items.some(item => item.toLowerCase() === searchValue.toLowerCase())) {
      setError(`${activeTab === 'atlas-tags' ? 'Tag' : 'Collection'} already exists`);
      return;
    }
    
    createItem(searchValue.trim());
    setSearchValue('');
    setError('');
  };

  const handleEdit = (item: string) => {
    setEditingItem(item);
    setEditValue(item);
  };

  const handleSaveEdit = () => {
    if (!editValue.trim()) {
      setError('Name cannot be empty');
      return;
    }
    
    if (editValue !== editingItem && items.some(item => item.toLowerCase() === editValue.toLowerCase())) {
      setError(`${activeTab === 'atlas-tags' ? 'Tag' : 'Collection'} already exists`);
      return;
    }
    
    if (editingItem) {
      void updateItem(editingItem, editValue.trim());
    }
    
    setEditingItem(null);
    setEditValue('');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditValue('');
    setError('');
  };

  const confirmDelete = async (names: string[]): Promise<boolean> => {
    if (activeTab === 'atlas-tags') return true;
    return confirmAction({
      title: names.length === 1 ? `Delete collection "${names[0]}"?` : `Delete ${names.length} collections?`,
      message: ['Every scene, map, token and encounter in it moves to the trash.'],
      confirmLabel: 'Delete',
      destructive: true,
    });
  };

  const handleDelete = async (item: string): Promise<void> => {
    if (await confirmDelete([item])) await deleteItem(item);
  };

  const handleDeleteSelected = async (): Promise<void> => {
    const selected = Array.from(selectedItems);
    if (!(await confirmDelete(selected))) return;
    for (const item of selected) await deleteItem(item);
    setSelectedItems(new Set());
  };

  const handleItemSelect = (item: string, event?: React.MouseEvent) => {
    const isShiftKey = event && event.shiftKey;
    const isCheckbox = event && (event.target as HTMLElement).closest('.selection-checkbox');
    
    if (isShiftKey && selectedItems.size > 0 && !isCheckbox) {
      // Range selection with Shift
      const allItems = filteredItems;
      const lastSelected = Array.from(selectedItems).pop();
      const lastIndex = lastSelected ? allItems.indexOf(lastSelected) : -1;
      const currentIndex = allItems.indexOf(item);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeItems = allItems.slice(start, end + 1);
        
        if (selectedItems.has(item)) {
          // If clicking on selected item with shift, deselect range
          const newSelected = new Set(selectedItems);
          rangeItems.forEach(i => newSelected.delete(i));
          setSelectedItems(newSelected);
        } else {
          // Add range to selection
          setSelectedItems(new Set([...selectedItems, ...rangeItems]));
        }
        return;
      }
    }
    
    // Checkbox or regular click - toggle selection
    const newSelected = new Set(selectedItems);
    if (newSelected.has(item)) {
      newSelected.delete(item);
    } else {
      newSelected.add(item);
    }
    setSelectedItems(newSelected);
  };

  const handleItemContextMenu = (item: string, event: React.MouseEvent) => {
    // If the item isn't selected, select only it
    if (!selectedItems.has(item)) {
      setSelectedItems(new Set([item]));
    }

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: 'Edit', icon: 'edit', onClick: () => handleEdit(item) },
      { type: 'separator' },
      {
        type: 'item',
        label: selectedItems.size > 1 ? `Delete ${selectedItems.size} items` : 'Delete',
        icon: 'trash',
        destructive: true,
        onClick: () => {
          if (selectedItems.size > 1) {
            void handleDeleteSelected();
          } else {
            void handleDelete(item);
          }
        },
      },
    ];

    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  if (!isOpen) return null;

  const itemLabel = activeTab === 'atlas-tags' ? 'tags' : 'collections';

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
              className={`atlas-tab-button ${activeTab === 'atlas-tags' ? 'atlas-active' : ''}`}
              onClick={() => setActiveTab('atlas-tags')}
            >
              <Tag size={16} />
              Tags
              <span className="atlas-tab-shortcut">⌘1</span>
            </button>
            <button
              className={`atlas-tab-button ${activeTab === 'atlas-collections' ? 'atlas-active' : ''}`}
              onClick={() => setActiveTab('atlas-collections')}
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
              <div
                key={item}
                className={`atlas-item-row ${selectedItems.has(item) ? 'atlas-selected' : ''}`}
                onClick={(e) => {
                  // Don't select if clicking on action buttons or editing
                  if ((e.target as HTMLElement).closest('.item-actions') || editingItem === item) {
                    return;
                  }
                  handleItemSelect(item, e);
                }}
                onContextMenu={(e) => handleItemContextMenu(item, e)}
              >
                <div className="atlas-selection-checkbox">
                  <LabelTooltip label={`Select ${item}`}>
                    <input 
                      type="checkbox" 
                      checked={selectedItems.has(item)} 
                      onChange={() => {}} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemSelect(item);
                      }}
                    />
                  </LabelTooltip>
                </div>

                {editingItem === item ? (
                  <div className="atlas-edit-mode">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      className="atlas-edit-input"
                    />
                    <LabelTooltip label="Save">
                      <Button variant="ghost" size="icon" className="atlas-collection-header-btn atlas-save-button" onClick={handleSaveEdit}>
                        <Check />
                      </Button>
                    </LabelTooltip>
                    <LabelTooltip label="Cancel">
                      <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={handleCancelEdit}>
                        <X />
                      </Button>
                    </LabelTooltip>
                  </div>
                ) : (
                  <>
                    <span className="atlas-item-name">
                      {activeTab === 'atlas-tags' ? <Tag size={14} /> : <FolderOpen size={14} />}
                      {item}
                    </span>
                    <div className="atlas-item-actions">
                      <LabelTooltip label="More actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="atlas-collection-header-btn"
                          onClick={(e) => { e.stopPropagation(); handleItemContextMenu(item, e); }}
                        >
                          <MoreVertical />
                        </Button>
                      </LabelTooltip>
                    </div>
                  </>
                )}
              </div>
            ))}

            {filteredItems.length === 0 && !showCreateOption && (
              <div className="atlas-empty-state">
                No {itemLabel} found
              </div>
            )}
          </div>
        </div>

        <div className="atlas-tag-manager-footer">
          {selectedItems.size > 0 && (
            <>
              <span className="atlas-selected-count">{selectedItems.size} selected</span>
              <Button variant="destructive" size="sm" onClick={() => { void handleDeleteSelected(); }}>
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
