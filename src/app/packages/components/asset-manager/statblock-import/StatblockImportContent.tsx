import { TokenRingToggle } from '../token-creator/TokenRingToggle';
import { TokenPortrait } from '../../shared/TokenPortrait';
import './statblock-import.scss';
import React, { useEffect, useId, useMemo, useState } from 'react';
import { TFile, type App } from 'obsidian';
import { ImageOff, Search } from 'lucide-react';
import { Button } from '../../primitives/button';
import { AssetService, type CollectionMetadata } from '../../../../services/AssetService';
import { StatblockTokenImportService, type StatblockImportResult } from '../../../../services/StatblockTokenImportService';
import type { StatblockImportCandidate, StatblockImportStatus } from '../../../../services/statblockImportCandidates';

interface Props {
  app: App;
  initialCollection: string;
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

export function StatblockImportContent({ app, initialCollection, onClose, controller, onRunningChange }: Props): React.JSX.Element {
  const importer = useMemo(() => new StatblockTokenImportService(app), [app]);
  const [rows, setRows] = useState<StatblockImportCandidate[]>([]);
  const [collections, setCollections] = useState<CollectionMetadata[]>([]);
  const [collection, setCollection] = useState(initialCollection);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState('');
  const [defaultRing, setDefaultRing] = useState(false);
  const [rings, setRings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<StatblockImportResult | null>(null);
  const [scanVersion, setScanVersion] = useState(0);
  const collectionId = useId();
  const layoutId = useId();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    void Promise.all([importer.scan(controller.signal), AssetService.getInstance(app).getCollections()]).then(([next, destinations]) => {
      if (!mounted || controller.signal.aborted) return;
      setRows(next);
      setLayout('');
      setCollections(destinations);
      setCollection(current => destinations.some(c => c.id === current) ? current : destinations[0]?.id ?? 'default');
      setSelected(new Set(next.filter(row => row.status === 'ready').map(row => row.path)));
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'Could not scan statblocks.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [app, importer, controller, scanVersion]);

  const scopedRows = rows.filter(row => !layout || (row.layoutName ?? 'Unspecified') === layout);
  const selectedPaths = scopedRows.filter(row => selected.has(row.path)).map(row => row.path);
  const filtered = scopedRows.filter(row => `${row.name} ${row.path}`.toLowerCase().includes(query.toLowerCase()));
  const ready = scopedRows.filter(row => row.status === 'ready');
  const disabled = loading || running || Boolean(result);
  const toggle = (path: string): void => {
    setSelected(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const startImport = async (): Promise<void> => {
    if (running || !selectedPaths.length) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    setProgress({ completed: 0, total: selectedPaths.length });
    try {
      const next = await importer.import(selectedPaths, collection, {
        signal: controller.signal,
        ringByPath: Object.fromEntries(selectedPaths.map(path => [path, rings[path] ?? defaultRing])),
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
      setResult(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import statblocks.');
    } finally { setRunning(false); onRunningChange?.(false); }
  };

  return (
    <div className="atlas-statblock-import">
      <p className="atlas-statblock-import__intro">Choose a system or layout, then import creatures with artwork. Your original notes and images stay intact.</p>
      {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
      {loading ? <p role="status">Scanning statblocks…</p> : (
        <>
          <div className="atlas-statblock-import__summary" role="status">
            <strong>{ready.length} ready</strong><span>{scopedRows.filter(r => r.status === 'imported').length} already imported</span><span>{scopedRows.length - ready.length - scopedRows.filter(r => r.status === 'imported').length} need attention</span>
          </div>
          <div className="atlas-statblock-import__controls">
            <label htmlFor={layoutId}>System / layout</label>
            <select id={layoutId} value={layout} onChange={e => setLayout(e.target.value)} disabled={disabled}>
              <option value="">All layouts</option>
              {[...new Set(rows.map(row => row.layoutName ?? 'Unspecified'))].sort().map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <TokenRingToggle label="Atlas ring for all" value={defaultRing} disabled={disabled} onChange={value => { setDefaultRing(value); setRings({}); }} />
          </div>
          <div className="atlas-statblock-import__controls">
            <label className="atlas-statblock-import__search"><Search size={16} /><input type="search" aria-label="Search statblocks" placeholder="Search creatures or folders…" value={query} onChange={e => setQuery(e.target.value)} /></label>
            <label htmlFor={collectionId}>Collection</label>
            <select id={collectionId} value={collection} onChange={e => setCollection(e.target.value)} disabled={disabled}>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="atlas-statblock-import__selection">
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setSelected(current => new Set([...current, ...filtered.filter(r => r.status === 'ready').map(r => r.path)]))}>Select all shown</Button>
            <Button variant="ghost" size="sm" disabled={disabled || selectedPaths.length === 0} onClick={() => setSelected(new Set())}>Clear selection</Button>
            <span>{selectedPaths.length} selected</span>
          </div>
          <div className="atlas-statblock-import__list" aria-label="Statblocks">
            {filtered.map(row => {
              const url = thumbnail(app, row);
              return <div key={row.path} className="atlas-statblock-import__row" title={row.detail}>
                <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.path)} disabled={disabled || row.status !== 'ready'} onChange={() => toggle(row.path)} />
                <span className="atlas-statblock-import__portrait">{url ? <TokenPortrait src={url} alt="" showRing={row.status === 'imported' ? row.showRing !== false : rings[row.path] ?? defaultRing} /> : <ImageOff size={20} />}</span>
                <span className="atlas-statblock-import__identity"><strong>{row.name}</strong><span>{row.path}</span></span>
                {row.status === 'ready' && <TokenRingToggle label={`Atlas ring for ${row.name}`} value={rings[row.path] ?? defaultRing} disabled={disabled} onChange={value => setRings(current => ({ ...current, [row.path]: value }))} />}
                <span className={`atlas-statblock-import__status atlas-statblock-import__status--${row.status}`}>{statusLabels[row.status]}</span>
              </div>;
            })}
            {filtered.length === 0 && <p>{query ? 'No statblocks match your search.' : 'No statblock notes found. Enable frontmatter parsing in Fantasy Statblocks, or add a statblock code block to a note.'}</p>}
          </div>
        </>
      )}
      {running && <div className="atlas-statblock-import__progress" role="status"><progress max={progress.total || 1} value={progress.completed} /><span>{stopping ? 'Stopping after the current token…' : `Importing ${progress.completed} of ${progress.total}…`}</span></div>}
      {result && <div className="atlas-statblock-import__result" role="status">
        <strong>{result.uncertain ? 'Import paused: check vault storage' : result.cancelled ? 'Import stopped' : 'Import complete'}</strong>
        <span>{result.items.filter(i => i.status === 'created').length} created · {result.items.filter(i => i.status === 'skipped').length} skipped · {result.items.filter(i => i.status === 'failed').length} failed</span>
        {result.items.some(i => i.status !== 'created') && <details><summary>View details</summary>{result.items.filter(i => i.status !== 'created').map(i => <p key={i.path}><strong>{i.name}:</strong> {i.message}</p>)}</details>}
      </div>}
      <div className="atlas-statblock-import__footer">
        {!running && !result && <Button variant="ghost" disabled={loading} onClick={() => setScanVersion(v => v + 1)}>Scan again</Button>}
        {running ? <Button variant="outline" disabled={stopping} onClick={() => { setStopping(true); controller.abort(); }}>Stop import</Button> : <Button variant="outline" onClick={onClose}>{result ? 'Done' : 'Cancel'}</Button>}
        {!result && <Button disabled={disabled || selectedPaths.length === 0 || collections.length === 0 || Boolean(error)} onClick={() => { void startImport(); }}>Import {selectedPaths.length} {selectedPaths.length === 1 ? 'token' : 'tokens'}</Button>}
      </div>
    </div>
  );
}
