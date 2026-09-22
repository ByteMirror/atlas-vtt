import { TokenPortrait } from '../../shared/TokenPortrait';
import './statblock-import.scss';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TFile, type App } from 'obsidian';
import { ImageOff, Search } from 'lucide-react';
import { ObsidianMenuDropdown } from '../../shared/ObsidianMenuDropdown';
import { Button } from '../../primitives/button';
import { StatblockTokenImportService } from '../../../../services/StatblockTokenImportService';
import { statblockPreviewImages } from '../token-creator/statblockPreviewImages';
import type { PreviewImage } from '../token-creator/types';
import type { StatblockImportCandidate, StatblockImportStatus } from '../../../../services/statblockImportCandidates';

interface Props {
  app: App;
  queuedPaths: readonly string[];
  onAdd: (images: PreviewImage[]) => void;
  onClose: () => void;
  controller: AbortController;
  onRunningChange?: (running: boolean) => void;
}
const statusLabels: Record<StatblockImportStatus, string> = {
  ready: 'Ready', imported: 'Already imported', 'missing-image': 'Missing image', 'remote-image': 'Remote image', conflict: 'Conflict',
};

function thumbnail(app: App, row: StatblockImportCandidate): string | undefined {
  const file = row.imagePath ? app.vault.getAbstractFileByPath(row.imagePath) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : undefined;
}

export function StatblockImportContent({ app, queuedPaths, onAdd, onClose, controller, onRunningChange }: Props): React.JSX.Element {
  const importer = useMemo(() => new StatblockTokenImportService(app), [app]);
  const [rows, setRows] = useState<StatblockImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [scanVersion, setScanVersion] = useState(0);
  const layoutId = useId();
  const queuedPathsRef = useRef(queuedPaths);
  queuedPathsRef.current = queuedPaths;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    void importer.scan(controller.signal).then(next => {
      if (!mounted || controller.signal.aborted) return;
      setRows(next);
      setLayout('');
      setSelected(new Set(next.filter(row => row.status === 'ready' && !queuedPathsRef.current.includes(row.path)).map(row => row.path)));
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'Could not scan statblocks.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [app, importer, controller, scanVersion]);

  const scopedRows = rows.filter(row => !layout || (row.layoutName ?? 'Unspecified') === layout);
  const selectedRows = scopedRows.filter(row => selected.has(row.path) && !queuedPaths.includes(row.path));
  const filtered = scopedRows.filter(row => `${row.name} ${row.path}`.toLowerCase().includes(query.toLowerCase()));
  const ready = scopedRows.filter(row => row.status === 'ready');
  const disabled = loading || running;
  const toggle = (path: string): void => {
    setSelected(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const startImport = async (): Promise<void> => {
    if (running || !selectedRows.length) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    try {
      const images = await statblockPreviewImages(app, selectedRows, controller.signal);
      if (!controller.signal.aborted) onAdd(images);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load statblock images.');
    } finally { setRunning(false); onRunningChange?.(false); }
  };

  return (
    <>
      <div className="atlas-token-creator__previews atlas-statblock-import">
        <p className="atlas-statblock-import__intro">Choose a system or layout, then add creatures to your import. Edit their tags, crop and rings in the preview cards.</p>
        {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
        {loading ? <p role="status">Scanning statblocks…</p> : (
          <>
            <div className="atlas-statblock-import__summary" role="status">
              <strong>{ready.length} ready</strong><span>{scopedRows.filter(r => r.status === 'imported').length} already imported</span><span>{scopedRows.length - ready.length - scopedRows.filter(r => r.status === 'imported').length} need attention</span>
            </div>
            <div className="atlas-statblock-import__controls">
              <label htmlFor={layoutId}>System / layout</label>
              <ObsidianMenuDropdown
                id={layoutId}
                value={layout}
                onChange={setLayout}
                disabled={disabled}
                placeholder="All layouts"
                options={Object.fromEntries<string>([
                  ['', 'All layouts'] as const,
                  ...[...new Set(rows.map(row => row.layoutName ?? 'Unspecified'))].sort().map(name => [name, name] as const),
                ])}
              />
            </div>
            <div className="atlas-statblock-import__controls">
              <label className="atlas-statblock-import__search"><Search size={16} /><input type="search" aria-label="Search statblocks" placeholder="Search creatures or folders…" value={query} onChange={e => setQuery(e.target.value)} /></label>
            </div>
            <div className="atlas-statblock-import__selection">
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setSelected(current => new Set([...current, ...filtered.filter(r => r.status === 'ready' && !queuedPaths.includes(r.path)).map(r => r.path)]))}>Select all shown</Button>
              <Button variant="ghost" size="sm" disabled={disabled || selectedRows.length === 0} onClick={() => setSelected(new Set())}>Clear selection</Button>
              <span>{selectedRows.length} selected</span>
            </div>
            <div className="atlas-statblock-import__list" aria-label="Statblocks">
              {filtered.map(row => {
                const url = thumbnail(app, row);
                return <div key={row.path} className="atlas-statblock-import__row" title={row.detail}>
                  <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.path)} disabled={disabled || row.status !== 'ready' || queuedPaths.includes(row.path)} onChange={() => toggle(row.path)} />
                  <span className="atlas-statblock-import__portrait">{url ? <TokenPortrait src={url} alt="" showRing={false} /> : <ImageOff size={20} />}</span>
                  <span className="atlas-statblock-import__identity"><strong>{row.name}</strong><span>{row.path}</span></span>
                  <span className={`atlas-statblock-import__status atlas-statblock-import__status--${row.status}`}>{queuedPaths.includes(row.path) ? 'Added to import' : statusLabels[row.status]}</span>
                </div>;
              })}
              {filtered.length === 0 && <p>{query ? 'No statblocks match your search.' : 'No statblock notes found. Enable frontmatter parsing in Fantasy Statblocks, or add a statblock code block to a note.'}</p>}
            </div>
          </>
        )}
      </div>
      <footer className="atlas-token-creator__footer atlas-statblock-import__footer">
        <Button variant="ghost" disabled={disabled} onClick={() => setScanVersion(v => v + 1)}>Scan again</Button>
        <div className="atlas-token-creator__actions">
          <Button variant="outline" onClick={onClose}>Back to previews</Button>
          <Button disabled={disabled || selectedRows.length === 0 || Boolean(error)} onClick={() => { void startImport(); }}>{running ? 'Loading images…' : `Add ${selectedRows.length} to import`}</Button>
        </div>
      </footer>
    </>
  );
}
