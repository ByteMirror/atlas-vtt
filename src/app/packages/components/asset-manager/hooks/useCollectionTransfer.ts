import { useState } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { exportCollectionBundle, type BundleProgress } from '../../../../services/collectionBundle/collectionExport';
import { importCollectionBundle, type CollectionImportResult, type UpdateRequest } from '../../../../services/collectionBundle/collectionImport';
import type { ProgressModalPrompt } from '../../primitives/ProgressModal';
import { formatRelativeTime } from '../../../../utils/relativeTime';

export interface CollectionTransfer {
  kind: 'export' | 'import';
  progress: BundleProgress;
  /** Set while the transfer waits for the user or once it has finished; `progress.message` says what about. */
  prompt?: ProgressModalPrompt;
}

export interface CollectionTransferActions {
  /** The export or import in progress; the UI blocks while it is set. */
  transfer: CollectionTransfer | null;
  handleExportCollection: () => Promise<void>;
  handleImportCollection: () => void;
}

interface Deps {
  app: ObsidianApp;
  assetService: AssetService | null;
  selectedCollection: string | null;
  onImported: () => Promise<void>;
}

function describeImportResult(result: CollectionImportResult): string {
  const name = `"${result.collectionName}"`;
  return result.outcome === 'created'
    ? `Imported ${name} with ${result.assetCount} assets.`
    : `Updated ${name} with ${result.assetCount} assets from the export.`;
}

function describeUpdateRequest({ existing, imported, exportedAt }: UpdateRequest): string {
  const copy = existing.name === imported.name ? `"${existing.name}"` : `"${imported.name}" as "${existing.name}"`;
  return `This vault already has ${copy}. Update it from this export, made ${formatRelativeTime(exportedAt)}? `
    + 'Its files and assets replace the ones in this vault.';
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

  const close = (): void => setTransfer(null);

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (kind: CollectionTransfer['kind'], message: string): void => {
    setTransfer({
      kind,
      progress: { message, fraction: 1 },
      prompt: { actions: [{ label: 'Close', onSelect: close, isPrimary: true }], onDismiss: close },
    });
  };

  const confirmUpdate = (request: UpdateRequest): Promise<boolean> => new Promise((resolve) => {
    const answer = (update: boolean) => (): void => {
      setTransfer(update ? { kind: 'import', progress: { message: 'Updating…', fraction: 0 } } : null);
      resolve(update);
    };
    setTransfer({
      kind: 'import',
      progress: { message: describeUpdateRequest(request), fraction: 0 },
      prompt: {
        actions: [{ label: 'Cancel', onSelect: answer(false) }, { label: 'Update', onSelect: answer(true), isPrimary: true }],
        onDismiss: answer(false),
      },
    });
  });

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
      result = await importCollectionBundle(app, assetService, file, {
        onProgress: (progress) => setTransfer({ kind: 'import', progress }),
        confirmUpdate,
      });
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      finish('import', error instanceof Error ? error.message : 'Import failed.');
      return;
    }
    if (result.outcome === 'kept') return;
    finish('import', describeImportResult(result));
    // The import is complete; a failed refresh must not report it as failed.
    try {
      await onImported();
    } catch (error) {
      console.error('[useCollectionTransfer] Refreshing after import failed:', error);
    }
    app.workspace.trigger('atlas-vtt:refresh-assets');
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

  return { transfer, handleExportCollection, handleImportCollection };
}
