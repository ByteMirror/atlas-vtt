import { matchesMapHotkey } from '../../keyboard/mapHotkeys';
import { SettingsService } from '../../services/SettingsService';
import { isShortcutScopeActive } from '../../utils/activeLeafGuard';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ExternalLink, FileText, Replace } from 'lucide-react';
import { useAtlasStore } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { TokenEntity } from '../../types';
import { App, TFile, Component, WorkspaceLeaf } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../../utils/embeddedLeafFocus';
import FantasyStatblock from './FantasyStatblock';
import LinkedNotePicker from './LinkedNotePicker';
import { Button } from '../../packages/components/primitives/button';
import { addTokenHighlight, zoomToTokenWithHighlight } from '../../pixi/utils/tokenHighlight';
import { toTokenVitals } from '../../services/statblockVitalsSync';
import { findCreatureForNotePath } from '../../services/FantasyStatblocksService';
import { resolveStatblockNote } from '../../services/statblockNoteSource';
import { runInBackground } from '../../utils/backgroundTask';

interface DMDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Separate component for note content to avoid re-render issues
interface NoteContentProps {
  notePath: string;
  app: App;
  onFocus?: () => void;
}

const NoteContent: React.FC<NoteContentProps> = ({ notePath, app, onFocus }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<WorkspaceLeaf | null>(null);
  const componentRef = useRef<Component | null>(null);
  const cleanupTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || !notePath) return;

    const loadNoteWithLeaf = async () => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;

      try {
        // Clear previous content
        if (containerRef.current) {
          containerRef.current.empty();
        }

        // Clean up previous leaf
        if (leafRef.current) {
          leafRef.current.detach();
          leafRef.current = null;
        }

        const ws = app.workspace as any;

        // Temporarily suppress setActiveLeaf during leaf creation + file opening
        // so Obsidian never switches away from the atlas canvas view.
        const origSetActiveLeaf = app.workspace.setActiveLeaf.bind(app.workspace);
        const suppressActiveLeaf = (): void => {
          app.workspace.setActiveLeaf = (() => {}) as any;
        };
        const restoreActiveLeaf = (): void => {
          app.workspace.setActiveLeaf = origSetActiveLeaf;
        };

        // Strategy 1: Try Obsidian's popover helpers
        if (typeof ws.getLeafPopover === 'function' && typeof ws.openPopover === 'function') {
          try {
            const currentActiveLeaf = getActiveWorkspaceLeaf(app.workspace);

            suppressActiveLeaf();
            leafRef.current = ws.getLeafPopover();

            if (leafRef.current) {
              await leafRef.current.openFile(file, { active: false });

              restoreActiveLeaf();

              if (containerRef.current) {
                containerRef.current.empty();
                (document.activeElement as HTMLElement)?.blur();
                ws.openPopover(leafRef.current, containerRef.current, { focus: false });
              }

              if (currentActiveLeaf) {
                app.workspace.setActiveLeaf(currentActiveLeaf, { focus: false });
              }

              return;
            } else {
              restoreActiveLeaf();
            }
          } catch (err) {
            restoreActiveLeaf();
            console.error('[NoteContent] Popover strategy failed:', err);
          }
        }

        // Strategy 2: Create a hidden leaf; dm-dashboard.scss hides its tab via data-dm-dashboard-preview
        const originalActiveLeaf = getActiveWorkspaceLeaf(app.workspace);

        // Suppress setActiveLeaf during leaf creation so Obsidian never
        // switches away from the atlas canvas view (prevents flash).
        suppressActiveLeaf();
        leafRef.current = app.workspace.getLeaf(true);

        if (leafRef.current) {
          (leafRef.current as any).containerEl.setAttribute('data-dm-dashboard-preview', 'true');
          const tabHeader = (leafRef.current as any).tabHeaderEl;
          if (tabHeader) {
            tabHeader.setAttribute('data-dm-dashboard-preview', 'true');
          }

          leafRef.current.detach();
        }

        // Restore setActiveLeaf and re-activate the original leaf immediately
        // after detach, before any async work.
        restoreActiveLeaf();
        if (originalActiveLeaf && originalActiveLeaf !== leafRef.current) {
          app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
        }

        if (!leafRef.current) {
          // nothing to do
        } else {
          try {
            await leafRef.current.openFile(file, { active: false });
          } catch (innerErr) {
            console.error('[NoteContent] Error opening file in hidden leaf:', innerErr);
          }

          if (containerRef.current && leafRef.current?.view?.containerEl) {
            containerRef.current.empty();

            // Ensure the view is properly initialized before appending
            const viewContainer = leafRef.current.view.containerEl;
            if (viewContainer) {
              // Remove focus from any active element to prevent CodeMirror errors
              (document.activeElement as HTMLElement)?.blur();

              containerRef.current.appendChild(viewContainer);

              viewContainer.classList.add('atlas-embedded-leaf-view', 'atlas-embedded-leaf-view--fill-editor');
            }
          }
        }
      } catch (err) {
        console.error('[NoteContent] Failed to load note with leaf:', err);
      }
    };

    void loadNoteWithLeaf();

    // Cleanup
    return () => {
      // Clear any pending cleanup timeout
      if (cleanupTimeoutRef.current) {
        window.clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      // Clean up in the correct order to avoid null reference errors
      if (leafRef.current) {
        try {
          const leaf = leafRef.current;

          // First, deactivate any CodeMirror instances
          if (leaf.view?.containerEl) {
            // Force blur to deactivate CodeMirror
            leaf.view.containerEl.querySelectorAll<HTMLElement>('.cm-editor').forEach((editor) => editor.blur());

            // Remove the view container from DOM
            if (leaf.view.containerEl.parentElement) {
              leaf.view.containerEl.remove();
            }
          }

          // Give CodeMirror time to clean up before detaching
          cleanupTimeoutRef.current = window.setTimeout(() => {
            try {
              if (leaf && leaf.view) {
                leaf.detach();
              }
            } catch {
              // Ignore errors during cleanup
            }
          }, 100);

          leafRef.current = null;
        } catch (err) {
          console.error('[NoteContent] Cleanup error:', err);
        }
      }

      if (componentRef.current) {
        componentRef.current.unload();
        componentRef.current = null;
      }
    };
  }, [notePath, app]);

  return (
    <div
      ref={containerRef}
      className="atlas-dm-note-content"
      style={{
        height: '100%',
        minHeight: '400px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    />
  );
};

interface LoadedStatblock {
  path: string;
  tokens: TokenEntity[];
}

export default function DMDashboard({ isOpen, onClose }: DMDashboardProps) {
  const tokens = useAtlasStore((state) => state.objects?.tokens || {});
  const linkedNotePath = useAtlasStore((state) => state.dmNotePath);
  const setLinkedNotePath = useAtlasStore((state) => state.setDMNotePath);
  const linkedNoteName = linkedNotePath?.split('/').pop()?.replace(/\.md$/, '');
  const { app, view } = useAtlasUI();
  const updateToken = useAtlasStore((state) => state.updateToken);
  const [statblocks, setStatblocks] = useState<Map<string, LoadedStatblock>>(new Map());
  const [loading, setLoading] = useState(true);
  const [contentReady, setContentReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isNoteFocused, setIsNoteFocused] = useState(false);
  const componentRef = useRef<Component>(new Component());
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 2;
    const width = window.innerWidth;
    if (width >= 2400) return 4;
    if (width >= 1400) return 3;
    if (width >= 768) return 2;
    return 1;
  });

  // Animated close: play exit animation, then call the real onClose
  const handleClose = useCallback((): void => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200); // matches CSS animation duration
  }, [closing, onClose]);

  // Handle window resize to update column count
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      let newColumnCount: number;
      if (width >= 2400) newColumnCount = 4;
      else if (width >= 1400) newColumnCount = 3;
      else if (width >= 768) newColumnCount = 2;
      else newColumnCount = 1;
      setColumnCount(newColumnCount);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Get unique statblocks from tokens on the map
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadStatblocks = async () => {
      setLoading(true);
      const tokensArray = Object.values(tokens);

      // Extract just the statblock paths from tokens to check if we need to reload
      const currentStatblockPaths = new Set<string>();
      tokensArray.forEach((token) => {
        if ((token as any).statblockPath) {
          currentStatblockPaths.add((token as any).statblockPath);
        }
      });

      // Check if statblock paths have changed
      const existingPaths = new Set(statblocks.keys());
      const pathsChanged = currentStatblockPaths.size !== existingPaths.size ||
        [...currentStatblockPaths].some(path => !existingPaths.has(path));

      if (!pathsChanged && statblocks.size > 0) {
        // Just update the tokens for existing statblocks without recreating the Map
        setStatblocks(prev => {
          const updatedMap = new Map([...prev].map(([path, statblock]) => [path, { ...statblock, tokens: [] as TokenEntity[] }]));

          // Redistribute tokens
          tokensArray.forEach((token) => {
            if ((token as any).statblockPath) {
              const path = (token as any).statblockPath;
              const existing = updatedMap.get(path);
              if (existing) {
                existing.tokens.push(token);
              }
            }
          });

          return updatedMap;
        });
        setLoading(false);
        return;
      }

      // Only recreate the Map if statblock paths have actually changed
      const uniqueStatblocks = new Map<string, LoadedStatblock>();

      // Group tokens by statblock path
      const tokensByStatblock = new Map<string, TokenEntity[]>();
      tokensArray.forEach((token) => {
        if ((token as any).statblockPath) {
          const path = (token as any).statblockPath;
          const existing = tokensByStatblock.get(path) || [];
          existing.push(token);
          tokensByStatblock.set(path, existing);
        }
      });

      // Old Atlas notes can still be linked to tokens, but are not Fantasy
      // Statblocks creatures. Only allocate cards for supported note sources.
      for (const [path, pathTokens] of tokensByStatblock.entries()) {
        const file = app.vault.getAbstractFileByPath(path);
        if (
          file instanceof TFile &&
          (findCreatureForNotePath(path) || await resolveStatblockNote(app, file))
        ) {
          uniqueStatblocks.set(path, {
            path,
            tokens: pathTokens
          });
        }
      }

      if (cancelled) return;
      setStatblocks(uniqueStatblocks);
      setLoading(false);
    };

    runInBackground(loadStatblocks(), 'Loading dashboard statblocks');
    return () => { cancelled = true; };
  }, [tokens, isOpen, app]);

  // Reveal the dashboard once statblocks finish loading (prevents layout shift)
  useEffect(() => {
    if (!isOpen) {
      setContentReady(false);
      return;
    }
    if (!loading) {
      // Use rAF to ensure the browser has painted the final layout before animating in
      const id = window.requestAnimationFrame(() => setContentReady(true));
      return () => window.cancelAnimationFrame(id);
    }
  }, [loading, isOpen]);

  // Handle dashboard close/cleanup
  useEffect(() => {
    if (!isOpen) {
      setIsNoteFocused(false);
      setLoading(true);
    }
  }, [isOpen]);

  // Handle note focus with keyboard event capture (same pattern as NotePreviewWindow)
  useEffect(() => {
    if (!isOpen || !isNoteFocused) return;

    const notesSection = document.querySelector('.atlas-dm-notes-section');
    if (!notesSection) return;

    // Stop all keyboard events from propagating when note is focused
    // This prevents canvas-level hotkeys while editing
    const stopKeyPropagation = (e: KeyboardEvent) => {
      e.stopPropagation();

      // Handle ESC to unfocus
      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault(); // Prevent default ESC behavior

        // Give CodeMirror time to finish processing before unfocusing
        window.setTimeout(() => {
          setIsNoteFocused(false);

          // Move focus to a safe element instead of just blurring
          const dashboardElement = dashboardRef.current;
          if (dashboardElement) {
            dashboardElement.focus();
          }
        }, 50);
      }
    };

    notesSection.addEventListener('keydown', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keyup', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keypress', stopKeyPropagation as EventListener);

    return () => {
      notesSection.removeEventListener('keydown', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keyup', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keypress', stopKeyPropagation as EventListener);
    };
  }, [isOpen, isNoteFocused]);

  // Handle click events to manage focus
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Ignore clicks on statblocks to prevent unnecessary re-renders
      const clickedStatblock = target.closest('.compact-statblock');
      if (clickedStatblock) {
        return; // Don't change focus state for statblock clicks
      }

      // Check if click is within note content area
      const notesSection = document.querySelector('.atlas-dm-notes-section');
      const noteContent = document.querySelector('.atlas-dm-note-content');

      if (notesSection?.contains(target) || noteContent?.contains(target)) {
        // Clicked inside notes section
        if (!isNoteFocused) {
          setIsNoteFocused(true);
        }
      } else if (dashboardRef.current?.contains(target)) {
        // Clicked elsewhere in dashboard
        if (isNoteFocused) {
          setIsNoteFocused(false);
        }
      }
    };

    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [isOpen, isNoteFocused]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Don't handle shortcuts if note is focused (keyboard events are already stopped by stopPropagation)
      if (isNoteFocused) return;

      if (e.defaultPrevented || !isShortcutScopeActive(dashboardRef.current, view?.viewId)) return;
      if (document.querySelector('.atlas-onboarding-overlay, .atlas-hotkey-help, .modal-container')) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (matchesMapHotkey(e, 'dashboard', SettingsService.forApp(app))) {
        e.preventDefault();
        handleClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleClose, isNoteFocused, app, view]);

  // Component lifecycle management
  useEffect(() => {
    componentRef.current.load();

    return () => {
      componentRef.current.unload();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="atlas-dm-dashboard-wrapper" ref={dashboardRef} tabIndex={-1}>
      <div className={`atlas-dm-dashboard-backdrop ${closing ? 'is-closing' : ''}`} onClick={handleClose} />

      <div className={`atlas-dm-dashboard ${closing ? 'is-closing' : contentReady ? 'is-visible' : ''}`}>
        <div className="atlas-dm-dashboard-content">
          {/* Left side - Statblocks (50% height) */}
          <div className="atlas-dm-statblocks-section">
            {loading ? (
              <div className="atlas-dm-loading">Loading statblocks...</div>
            ) : (
              <div className="atlas-dm-statblocks-grid">
                {statblocks.size === 0 ? (
                  <div className="atlas-dm-empty-state">
                    <p>No statblocks currently in use on this map.</p>
                  </div>
                ) : (
                  (() => {
                    // Create columns array based on state
                    const columns: Array<Array<[string, LoadedStatblock]>> = Array.from({ length: columnCount }, () => []);

                    // Distribute statblocks across columns
                    Array.from(statblocks.entries()).forEach(([path, statblock], index) => {
                      columns[index % columnCount]!.push([path, statblock]);
                    });

                    return (
                      <div className="atlas-dm-statblocks-masonry">
                        {columns.map((column, columnIndex) => (
                          <div key={columnIndex} className="atlas-dm-statblocks-column">
                            {column.map(([path, statblock]) => (
                              <FantasyStatblock
                                key={path}
                                notePath={path}
                                app={app}
                                tokens={statblock.tokens.map(toTokenVitals)}
                                tokenActions={{
                                  onUpdateToken: (id, updates) => updateToken(id, updates),
                                  onHoverToken: (id) => addTokenHighlight(view, id, { highlightDuration: 800 }),
                                  onLocateToken: (id) => {
                                    const token = tokens[id];
                                    if (!token) return;
                                    zoomToTokenWithHighlight(view, id, { x: token.x, y: token.y });
                                    handleClose();
                                  },
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>

          {/* Right side - note linked to this map */}
          <div className="atlas-dm-notes-section">
            <div className="atlas-linked-note-header">
              <FileText className="atlas-linked-note-header-icon" />
              <div className="atlas-linked-note-header-text">
                <h3>{linkedNoteName ?? 'Link a note to this map'}</h3>
                <p>{linkedNotePath ?? 'Pick a note to keep beside the map'}</p>
              </div>
              {linkedNotePath && (
                <div className="atlas-linked-note-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="atlas-linked-note-action"
                    title="Open note in new tab"
                    aria-label="Open note in new tab"
                    onClick={() => runInBackground(app.workspace.openLinkText('', linkedNotePath, true), `Opening ${linkedNotePath}`, 'Could not open the note')}
                  >
                    <ExternalLink />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="atlas-linked-note-action"
                    title="Link a different note"
                    aria-label="Link a different note"
                    onClick={() => setLinkedNotePath(null)}
                  >
                    <Replace />
                  </Button>
                </div>
              )}
            </div>
            <div className="atlas-dm-notes-content">
              {linkedNotePath ? (
                <NoteContent
                  notePath={linkedNotePath}
                  app={app}
                  onFocus={() => setIsNoteFocused(true)}
                />
              ) : (
                <LinkedNotePicker app={app} onSelect={setLinkedNotePath} />
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
