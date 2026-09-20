import React, { useState, useEffect } from 'react';
import { FileText, Unlink } from 'lucide-react';
import { App } from 'obsidian';
import { getFantasyStatblocksApi } from '../../../services/FantasyStatblocksService';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';

interface StatblockLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: any;
  onLink: (statblockPath: string | null) => void;
  app: App;
}

interface StatblockEntry {
  path: string;
  name: string;
}

const StatblockLinkModal: React.FC<StatblockLinkModalProps> = ({
  isOpen,
  onClose,
  asset,
  onLink,
  app: _app,
}) => {
  const [statblockEntries, setStatblockEntries] = useState<StatblockEntry[]>([]);
  const [fsAvailable, setFsAvailable] = useState(true);
  const [currentLink, setCurrentLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadStatblockEntries();
      setCurrentLink(asset.statblockPath || null);
    }
  }, [isOpen, asset]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const loadStatblockEntries = () => {
    const api = getFantasyStatblocksApi();
    setFsAvailable(api !== null);
    if (!api) {
      setStatblockEntries([]);
      return;
    }

    // Only note-backed creatures can be linked to tokens (the link is a note path)
    const entries = api.getBestiaryCreatures()
      .filter((creature): creature is { name: string; path: string } => Boolean(creature.name && creature.path))
      .map((creature) => ({ path: creature.path, name: creature.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setStatblockEntries(entries);
  };

  const filteredEntries = statblockEntries.filter((entry) =>
    entry.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLink = (path: string | null) => {
    onLink(path);
    onClose();
  };

  const handleUnlink = () => {
    handleLink(null);
  };

  if (!isOpen) return null;

  return (
    <div className="atlas-modal-overlay" onClick={onClose}>
      <div className="atlas-modal-content atlas-statblock-link-modal" onClick={(e) => e.stopPropagation()}>
        <div className="atlas-modal-header">
          <h2>Link Statblock to {asset.name}</h2>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-modal-body">
          {currentLink && (
            <div className="atlas-current-link">
              <div className="atlas-current-link-info">
                <FileText size={16} />
                <span>Currently linked to: <strong>{currentLink.split('/').pop()?.replace('.md', '')}</strong></span>
              </div>
              <Button variant="outline" size="sm" onClick={handleUnlink}>
                <Unlink />
                Unlink
              </Button>
            </div>
          )}

          <div className="atlas-search-box">
            <input
              type="text"
              placeholder="Search statblocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="atlas-search-input"
            />
          </div>

          <div className="atlas-statblock-list">
            {filteredEntries.length === 0 ? (
              <div className="atlas-empty-state">
                {!fsAvailable
                  ? 'Install and enable the Fantasy Statblocks plugin to link statblocks.'
                  : searchQuery
                    ? 'No statblocks match your search'
                    : 'No note-based creatures found. Enable "Parse Frontmatter for Creatures" in Fantasy Statblocks settings.'}
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.path}
                  className={`atlas-statblock-item ${currentLink === entry.path ? 'atlas-current' : ''}`}
                  onClick={() => handleLink(entry.path)}
                >
                  <FileText size={16} />
                  <span className="atlas-statblock-name">{entry.name}</span>
                  <span className="atlas-statblock-path">{entry.path}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

export default StatblockLinkModal;
