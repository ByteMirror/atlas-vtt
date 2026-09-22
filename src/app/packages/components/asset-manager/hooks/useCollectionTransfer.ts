import { useState } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { exportCollectionBundle, type BundleProgress } from '../../../../services/collectionBundle/collectionExport';
import { importCollectionBundle, type CollectionImportResult } from '../../../../services/collectionBundle/collectionImport';
import { showAtlasToast } from '../../../../react/components/AtlasToast';

export interface CollectionTransfer {
  kind: 'export' | 'import';
  progress: BundleProgress;
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
  switch (result.outcome) {
    case 'created': return `Imported "${result.collectionName}" with ${result.assetCount} assets.`;
    case 'updated': return `Updated "${result.collectionName}" to v${result.version}.`;
    case 'already-current': return `"${result.collectionName}" is already up to date (v${result.version}).`;
    case 'newer-exists': return `A newer version of "${result.collectionName}" is already in this vault (v${result.localVersion ?? '?'}).`;
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

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || !selectedCollection || transfer) return;
    const collections = await assetService.getCollections();
    const match = collections.find((collection) => collection.name === selectedCollection || collection.id === selectedCollection);
    if (!match) return;
    setTransfer({ kind: 'export', progress: { message: 'Preparing…', fraction: 0 } });
    try {
      const blob = await exportCollectionBundle(app, assetService, match.id, (progress) => setTransfer({ kind: 'export', progress }));
      downloadBlob(blob, `${match.name}.atlas-collection.zip`);
      showAtlasToast(`Exported "${match.name}"`);
    } catch (error) {
      console.error('[useCollectionTransfer] Export failed:', error);
      showAtlasToast('Export failed');
    } finally {
      setTransfer(null);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (!assetService) return;
    setTransfer({ kind: 'import', progress: { message: 'Reading bundle…', fraction: 0 } });
    try {
      const result = await importCollectionBundle(app, assetService, file, (progress) => setTransfer({ kind: 'import', progress }));
      showAtlasToast(describeImportResult(result), 5000);
      if (result.outcome === 'created' || result.outcome === 'updated') {
        await onImported();
        app.workspace.trigger('atlas-vtt:refresh-assets');
      }
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      showAtlasToast(error instanceof Error ? error.message : 'Import failed', 5000);
    } finally {
      setTransfer(null);
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

  return { transfer, handleExportCollection, handleImportCollection };
}
