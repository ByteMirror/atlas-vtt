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
}
const statusLabels: Record<StatblockImportStatus, string> = {
  ready: 'Ready', imported: 'Already imported', 'missing-image': 'Missing image', 'remote-image': 'Remote image', conflict: 'Conflict',
};

function thumbnail(app: App, row: StatblockImportCandidate): string | undefined {
  const file = row.imagePath ? app.vault.getAbstractFileByPath(row.imagePath) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : undefined;
}

export function StatblockImportContent({ app, initialCollection, onClose, controller }: Props): React.JSX.Element {
  const importer = useMemo(() => new StatblockTokenImportService(app), [app]);
  const [rows, setRows] = useState<StatblockImportCandidate[]>([]);
  const [collections, setCollections] = useState<CollectionMetadata[]>([]);
  const [collection, setCollection] = useState(initialCollection);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<StatblockImportResult | null>(null);
  const [scanVersion, setScanVersion] = useState(0);
  const collectionId = useId();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    void Promise.all([importer.scan(controller.signal), AssetService.getInstance(app).getCollections()]).then(([next, destinations]) => {
      if (!mounted || controller.signal.aborted) return;
      setRows(next);
      setCollections(destinations);
      setCollection(current => destinations.some(c => c.id === current) ? current : destinations[0]?.id ?? 'default');
      setSelected(new Set(next.filter(row => row.status === 'ready').map(row => row.path)));
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : 'Could not scan statblocks.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [app, importer, controller, scanVersion]);

  const filtered = rows.filter(row => `${row.name} ${row.path}`.toLowerCase().includes(query.toLowerCase()));
  const ready = rows.filter(row => row.status === 'ready');
  const disabled = loading || running || Boolean(result);
  const toggle = (path: string): void => {
    setSelected(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const startImport = async (): Promise<void> => {
    if (running || !selected.size) return;
    setRunning(true);
    setError('');
    setProgress({ completed: 0, total: selected.size });
    try {
      const next = await importer.import([...selected], collection, {
        signal: controller.signal,
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
      setResult(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import statblocks.');
    } finally { setRunning(false); }
  };

  return (
    <div className="atlas-statblock-import">
      <p className="atlas-statblock-import__intro">Create linked tokens from statblocks with artwork. Each token gets its own image copy; your notes and original artwork stay intact.</p>
      {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
      {loading ? <p role="status">Scanning statblocks…</p> : (
        <>
          <div className="atlas-statblock-import__summary" role="status">
            <strong>{ready.length} ready</strong><span>{rows.filter(r => r.status === 'imported').length} already imported</span><span>{rows.length - ready.length - rows.filter(r => r.status === 'imported').length} need attention</span>
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
            <Button variant="ghost" size="sm" disabled={disabled || selected.size === 0} onClick={() => setSelected(new Set())}>Clear selection</Button>
            <span>{selected.size} selected</span>
          </div>
          <div className="atlas-statblock-import__list" aria-label="Statblocks">
            {filtered.map(row => {
              const url = thumbnail(app, row);
              return <label key={row.path} className="atlas-statblock-import__row" title={row.detail}>
                <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.path)} disabled={disabled || row.status !== 'ready'} onChange={() => toggle(row.path)} />
                <span className="atlas-statblock-import__portrait">{url ? <img src={url} alt="" loading="lazy" /> : <ImageOff size={20} />}</span>
                <span className="atlas-statblock-import__identity"><strong>{row.name}</strong><span>{row.path}</span></span>
                <span className={`atlas-statblock-import__status atlas-statblock-import__status--${row.status}`}>{statusLabels[row.status]}</span>
              </label>;
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
        {!result && <Button disabled={disabled || selected.size === 0 || collections.length === 0 || Boolean(error)} onClick={() => { void startImport(); }}>Import {selected.size} {selected.size === 1 ? 'token' : 'tokens'}</Button>}
      </div>
    </div>
  );
}
