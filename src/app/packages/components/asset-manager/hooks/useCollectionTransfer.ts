import { useState } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { exportCollectionBundle, type BundleProgress } from '../../../../services/collectionBundle/collectionExport';
import { importCollectionBundle, type CollectionImportResult } from '../../../../services/collectionBundle/collectionImport';
import { formatRelativeTime } from '../../../../utils/relativeTime';

export interface CollectionTransfer {
  kind: 'export' | 'import';
  progress: BundleProgress;
  /** The transfer finished; `progress.message` holds its result until the dialog is closed. */
  isDone?: boolean;
}

export interface CollectionTransferActions {
  /** The export or import in progress; the UI blocks while it is set. */
  transfer: CollectionTransfer | null;
  handleExportCollection: () => Promise<void>;
  handleImportCollection: () => void;
  /** Closes the dialog of a finished transfer. */
  dismissTransfer: () => void;
}

interface Deps {
  app: ObsidianApp;
  assetService: AssetService | null;
  selectedCollection: string | null;
  onImported: () => Promise<void>;
}

function describeImportResult(result: CollectionImportResult): string {
  const name = `"${result.collectionName}"`;
  switch (result.outcome) {
    case 'created': return `Imported ${name} with ${result.assetCount} assets.`;
    case 'updated': return `Updated ${name} to its export from ${formatRelativeTime(result.exportedAt)}.`;
    case 'repaired': return `Restored ${result.fileCount} missing files and ${result.assetCount} missing assets of ${name}.`;
    case 'already-current': return `This vault already has this export of ${name}.`;
    case 'newer-exists': {
      const localDate = result.localExportedAt === undefined ? '' : ` (from ${formatRelativeTime(result.localExportedAt)})`;
      return `This vault already has a newer export of ${name}${localDate}.`;
    }
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.body.createEl('a', { href: url, attr: { download: fileName } });
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Exports the selected collection to a zip and imports zips, showing progress while files are packed or written. */
export function useCollectionTransfer({ app, assetService, selectedCollection, onImported }: Deps): CollectionTransferActions {
  const [transfer, setTransfer] = useState<CollectionTransfer | null>(null);

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (kind: CollectionTransfer['kind'], message: string): void => {
    setTransfer({ kind, progress: { message, fraction: 1 }, isDone: true });
  };

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || !selectedCollection || transfer) return;
    const collections = await assetService.getCollections();
    const match = collections.find((collection) => collection.name === selectedCollection || collection.id === selectedCollection);
    if (!match) return;
    setTransfer({ kind: 'export', progress: { message: 'Preparing…', fraction: 0 } });
    try {
      const blob = await exportCollectionBundle(app, assetService, match.id, (progress) => setTransfer({ kind: 'export', progress }));
      const fileName = `${match.name}.atlas-collection.zip`;
      downloadBlob(blob, fileName);
      finish('export', `Saved "${match.name}" as ${fileName}.`);
    } catch (error) {
      console.error('[useCollectionTransfer] Export failed:', error);
      finish('export', error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.');
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (!assetService) return;
    setTransfer({ kind: 'import', progress: { message: 'Reading bundle…', fraction: 0 } });
    let result: CollectionImportResult;
    try {
      result = await importCollectionBundle(app, assetService, file, (progress) => setTransfer({ kind: 'import', progress }));
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      finish('import', error instanceof Error ? error.message : 'Import failed.');
      return;
    }
    finish('import', describeImportResult(result));
    if (result.outcome === 'created' || result.outcome === 'updated' || result.outcome === 'repaired') {
      // The import is complete; a failed refresh must not report it as failed.
      try {
        await onImported();
      } catch (error) {
        console.error('[useCollectionTransfer] Refreshing after import failed:', error);
      }
      app.workspace.trigger('atlas-vtt:refresh-assets');
    }
  };

  const handleImportCollection = (): void => {
    if (transfer) return;
    const input = document.body.createEl('input', {
      type: 'file',
      cls: 'atlas-hidden-file-input',
      attr: { accept: '.zip' },
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void importFile(file);
    });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  };

  const dismissTransfer = (): void => setTransfer(null);

  return { transfer, handleExportCollection, handleImportCollection, dismissTransfer };
}
