import React, { useState, useRef, useEffect } from 'react';
import { X, Tag, Heart, Plus } from 'lucide-react';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';

interface EditAssetTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetName: string;
  currentTags: string[];
  availableTags: string[];
  onSave: (tags: string[]) => void;
  onCreateTag: (tag: string) => void;
}

const EditAssetTagsModal: React.FC<EditAssetTagsModalProps> = ({
  isOpen,
  onClose,
  assetName,
  currentTags,
  availableTags,
  onSave,
  onCreateTag,
}) => {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set(currentTags));
  const [newTagValue, setNewTagValue] = useState('');
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedTags(new Set(currentTags));
  }, [currentTags]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedTags(new Set(currentTags));
        setNewTagValue('');
        setError('');
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentTags, onClose]);

  const handleAddNewTag = () => {
    const trimmedTag = newTagValue.trim();
    
    if (!trimmedTag) {
      setError('Tag name cannot be empty');
      return;
    }
    
    if (availableTags.includes(trimmedTag)) {
      setError('Tag already exists');
      return;
    }
    
    onCreateTag(trimmedTag);
    setSelectedTags(new Set([...selectedTags, trimmedTag]));
    setNewTagValue('');
    setError('');
  };

  const toggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
  };

  const removeTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    newSelected.delete(tag);
    setSelectedTags(newSelected);
  };

  const handleSave = () => {
    onSave(Array.from(selectedTags));
    onClose();
  };

  const handleCancel = () => {
    setSelectedTags(new Set(currentTags));
    setNewTagValue('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="atlas-vtt-plugin atlas-vtt-root atlas-edit-tags-modal" 
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
        className="atlas-edit-tags-content"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="atlas-edit-tags-header">
          <h3>Edit Tags</h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-asset-info">
          <span className="atlas-asset-name">{assetName}</span>
        </div>

        <div className="atlas-edit-tags-body">
          <div className="atlas-selected-tags-section">
            <h4>Selected Tags</h4>
            <div className="atlas-selected-tags-list">
              {Array.from(selectedTags).map((tag) => (
                <div key={tag} className="atlas-tag-pill">
                  {tag === 'Favorites' && <Heart size={12} />}
                  <span>{tag}</span>
                  <button
                    className="atlas-remove-tag-button"
                    onClick={() => removeTag(tag)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {selectedTags.size === 0 && (
                <div className="atlas-no-tags-message">No tags selected</div>
              )}
            </div>
          </div>

          <div className="atlas-add-tag-section">
            <h4>Add New Tag</h4>
            <div className="atlas-add-tag-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter tag name..."
                value={newTagValue}
                onChange={(e) => {
                  setNewTagValue(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddNewTag();
                  }
                }}
                className="atlas-add-tag-input"
              />
              <Button variant="default" size="sm" onClick={handleAddNewTag} disabled={!newTagValue.trim()}>
                <Plus />
                Add
              </Button>
            </div>
            {error && (
              <div className="atlas-error-message">{error}</div>
            )}
          </div>

          <div className="atlas-available-tags-section">
            <h4>Available Tags</h4>
            <div className="atlas-available-tags-list">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  className={`atlas-available-tag ${selectedTags.has(tag) ? 'atlas-selected' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  <Tag size={14} />
                  {tag === 'Favorites' && <Heart size={12} />}
                  <span>{tag}</span>
                  {selectedTags.has(tag) && <Check size={14} className="atlas-check-icon" />}
                </button>
              ))}
              {availableTags.length === 0 && (
                <div className="atlas-no-tags-message">No tags available. Create one above.</div>
              )}
            </div>
          </div>
        </div>

        <div className="atlas-edit-tags-footer">
          <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
          <Button variant="default" size="sm" onClick={handleSave}>Save tags</Button>
        </div>
      </div>
    </div>
  );
};

// Add the missing Check import
const Check: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default EditAssetTagsModal;