import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, SearchX } from 'lucide-react';
import { App, TFile, moment } from 'obsidian';

const MAX_NOTE_SIZE_BYTES = 1_000_000;
const RECENT_LIMIT = 20;
const SEARCH_LIMIT = 50;

interface LinkedNotePickerProps {
  app: App;
  onSelect: (path: string) => void;
}

/**
 * Notes offered for linking: hidden and oversized files are skipped, title
 * matches rank above path-only matches, newest first within each group.
 */
export function rankNotes(files: TFile[], query: string): TFile[] {
  const needle = query.trim().toLowerCase();
  const titleMatches = (file: TFile): boolean => file.basename.toLowerCase().includes(needle);

  return files
    .filter((file) => {
      const isHidden = file.path.startsWith('.') || file.path.includes('/.');
      if (isHidden || file.stat.size >= MAX_NOTE_SIZE_BYTES) return false;
      return !needle || titleMatches(file) || file.path.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (needle) {
        const rank = Number(titleMatches(b)) - Number(titleMatches(a));
        if (rank !== 0) return rank;
      }
      return b.stat.mtime - a.stat.mtime;
    })
    .slice(0, needle ? SEARCH_LIMIT : RECENT_LIMIT);
}

export default function LinkedNotePicker({ app, onSelect }: LinkedNotePickerProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const notes = useMemo(() => rankNotes(app.vault.getMarkdownFiles(), query), [app, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (notes.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + notes.length) % notes.length);
    } else if (e.key === 'Enter') {
      const note = notes[activeIndex];
      if (note) onSelect(note.path);
    }
  };

  return (
    <div className="atlas-linked-note-picker">
      <div className="atlas-linked-note-search">
        <Search className="atlas-linked-note-search-icon" />
        <input
          type="text"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search notes"
        />
      </div>

      <div className="atlas-linked-note-caption">
        <span>{query.trim() ? 'Results' : 'Recently modified'}</span>
        <span className="atlas-linked-note-count">{notes.length}</span>
      </div>

      {notes.length === 0 ? (
        <div className="atlas-linked-note-empty">
          <SearchX />
          <p>No notes match “{query.trim()}”</p>
        </div>
      ) : (
        <div className="atlas-linked-note-list" ref={listRef}>
          {notes.map((file, index) => (
            <button
              key={file.path}
              type="button"
              className={`atlas-linked-note-item ${index === activeIndex ? 'atlas-focused' : ''}`}
              onClick={() => onSelect(file.path)}
              onMouseMove={() => setActiveIndex(index)}
            >
              <span className="atlas-linked-note-item-icon"><FileText /></span>
              <span className="atlas-linked-note-item-text">
                <span className="atlas-linked-note-item-name">{file.basename}</span>
                <span className="atlas-linked-note-item-path">
                  {file.parent && !file.parent.isRoot() ? file.parent.path : 'Vault root'}
                </span>
              </span>
              <span className="atlas-linked-note-item-date">{moment(file.stat.mtime).fromNow()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
