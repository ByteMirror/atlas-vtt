import './statblock-import.scss';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Search } from 'lucide-react';
import { ObsidianMenuDropdown } from '../../shared/ObsidianMenuDropdown';
import { Button } from '../../primitives/button';
import { ProgressStatus } from '../../primitives/ProgressStatus';
import { useFrameProgress } from '../../primitives/useFrameProgress';
import { StatblockTokenImportService } from '../../../../services/StatblockTokenImportService';
import { statblockPreviewImages } from '../token-creator/statblockPreviewImages';
import type { PreviewImage } from '../token-creator/types';
import type { StatblockImportCandidate } from '../../../../services/statblockImportCandidates';
import { StatblockList } from './StatblockList';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../primitives/Skeleton';

const SCAN_SKELETON_ROWS = 6;

/** The list a scan will fill, as placeholder rows; the progress line above it says what is happening. */
function ScanSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup className="atlas-statblock-import__list">
      {Array.from({ length: SCAN_SKELETON_ROWS }, (_, index) => (
        <div key={index} className="atlas-statblock-import__pending-row">
          <Skeleton className="atlas-statblock-import__pending-check" />
          <Skeleton className="atlas-statblock-import__pending-portrait" />
          <span className="atlas-statblock-import__identity">
            <strong><Skeleton shape="text" width={skeletonTextWidth(index, 40)} /></strong>
            <span><Skeleton shape="text" width={skeletonTextWidth(index + 2, 60)} /></span>
          </span>
        </div>
      ))}
    </SkeletonGroup>
  );
}

interface Props {
  app: App;
  queuedPaths: readonly string[];
  onAdd: (images: PreviewImage[]) => void;
  onClose: () => void;
  controller: AbortController;
  onRunningChange?: (running: boolean) => void;
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
  const { progress: scanned, report: reportScan, clear: clearScan } = useFrameProgress();
  const { progress: loadedImages, report: reportImages, clear: clearImages } = useFrameProgress();
  const layoutId = useId();
  const queued = useMemo(() => new Set(queuedPaths), [queuedPaths]);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    clearScan();
    void importer.scan(controller.signal, reportScan).then(next => {
      if (!mounted || controller.signal.aborted) return;
      setRows(next);
      setLayout('');
      setSelected(new Set(next.filter(row => row.status === 'ready' && !queuedRef.current.has(row.path)).map(row => row.path)));
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'Could not scan statblocks.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [app, importer, controller, scanVersion, clearScan, reportScan]);

  const scopedRows = rows.filter(row => !layout || (row.layoutName ?? 'Unspecified') === layout);
  const selectedRows = scopedRows.filter(row => selected.has(row.path) && !queued.has(row.path));
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
    clearImages();
    try {
      const images = await statblockPreviewImages(app, selectedRows, controller.signal, reportImages);
      if (!controller.signal.aborted) onAdd(images);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load statblock images.');
    } finally { setRunning(false); onRunningChange?.(false); }
  };

  return (
    <>
      <div ref={setScrollElement} className="atlas-token-creator__previews atlas-statblock-import">
        <p className="atlas-statblock-import__intro">Choose a system or layout, then add creatures to your import. Edit their tags, crop and rings in the preview cards.</p>
        {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
        {loading ? (
          <>
            <div className="atlas-statblock-import__scanning">
              <ProgressStatus task={{ label: 'Scanning notes', done: scanned?.done ?? 0, total: scanned?.total ?? 0 }} />
            </div>
            <ScanSkeleton />
          </>
        ) : (
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
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setSelected(current => new Set([...current, ...filtered.filter(r => r.status === 'ready' && !queued.has(r.path)).map(r => r.path)]))}>Select all shown</Button>
              <Button variant="ghost" size="sm" disabled={disabled || selectedRows.length === 0} onClick={() => setSelected(new Set())}>Clear selection</Button>
              <span>{selectedRows.length} selected</span>
            </div>
            {filtered.length > 0
              ? <StatblockList app={app} rows={filtered} selected={selected} queued={queued} disabled={disabled} scrollElement={scrollElement} onToggle={toggle} />
              : <p>{query ? 'No statblocks match your search.' : 'No statblock notes found. Enable frontmatter parsing in Fantasy Statblocks, or add a statblock code block to a note.'}</p>}
          </>
        )}
      </div>
      <footer className="atlas-token-creator__footer atlas-statblock-import__footer">
        <ProgressStatus task={running ? { label: 'Loading images', done: loadedImages?.done ?? 0, total: loadedImages?.total ?? selectedRows.length } : null}>
          <Button variant="ghost" disabled={disabled} onClick={() => setScanVersion(v => v + 1)}>Scan again</Button>
        </ProgressStatus>
        <div className="atlas-token-creator__actions">
          <Button variant="outline" onClick={onClose}>Back to previews</Button>
          <Button disabled={disabled || selectedRows.length === 0 || Boolean(error)} onClick={() => { void startImport(); }}>{running ? 'Loading images…' : `Add ${selectedRows.length} to import`}</Button>
        </div>
      </footer>
    </>
  );
}
