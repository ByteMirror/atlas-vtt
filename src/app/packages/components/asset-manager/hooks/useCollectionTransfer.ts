import { useEffect, useRef, useState } from 'react';
import { Notice, type App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { exportCollectionBundle, type BundleProgress } from '../../../../services/collectionBundle/collectionExport';
import { importCollectionBundle, type CollectionImportResult, type UpdateRequest } from '../../../../services/collectionBundle/collectionImport';
import { confirmAction } from '../../../../ui/confirmDialog';
import type { ProgressModalPrompt } from '../../primitives/ProgressModal';
import { formatRelativeTime } from '../../../../utils/relativeTime';

export interface CollectionTransfer {
  title: string;
  progress: BundleProgress;
  /** Set once the transfer has finished: `progress.message` is its result, shown until closed. */
  prompt?: ProgressModalPrompt;
  /**
   * A confirmation dialog is open. It stacks below the progress dialog, which
   * therefore hides, while the asset manager still treats a dialog as open.
   */
  isAwaitingConfirmation?: boolean;
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

const EXPORTING = 'Exporting collection';
const IMPORTING = 'Importing collection';

function describeImportResult(result: CollectionImportResult): string {
  const name = `"${result.collectionName}"`;
  return result.outcome === 'created'
    ? `Imported ${name} with ${result.assetCount} assets.`
    : `Updated ${name} with ${result.assetCount} assets from the export.`;
}

/** Only the user knows whether the export or the vault's copy holds the work to keep. */
function confirmUpdate({ existing, imported, exportedAt }: UpdateRequest): Promise<boolean> {
  return confirmAction({
    title: 'Update collection',
    message: [
      `This vault already has "${existing.name}". The export of "${imported.name}" was made ${formatRelativeTime(exportedAt)}.`,
      'Updating replaces the collection\'s name, settings, files and assets in this vault with the ones from the export.',
    ],
    confirmLabel: 'Update',
    destructive: true,
  });
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
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return (): void => { isMounted.current = false; };
  }, []);

  const close = (): void => setTransfer(null);

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (title: string, message: string): void => {
    // An update can close the map view hosting this asset manager; the result must still reach the user.
    if (!isMounted.current) {
      new Notice(message);
      return;
    }
    setTransfer({
      title,
      progress: { message, fraction: 1 },
      prompt: { actions: [{ label: 'Close', onSelect: close, isPrimary: true }], onDismiss: close },
    });
  };

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || !selectedCollection || transfer) return;
    const collections = await assetService.getCollections();
    const match = collections.find((collection) => collection.name === selectedCollection || collection.id === selectedCollection);
    if (!match) return;
    setTransfer({ title: EXPORTING, progress: { message: 'Preparing…', fraction: 0 } });
    try {
      const blob = await exportCollectionBundle(app, assetService, match.id, (progress) => setTransfer({ title: EXPORTING, progress }));
      const fileName = `${match.name}.atlas-collection.zip`;
      downloadBlob(blob, fileName);
      finish('Collection exported', `Packed "${match.name}" into ${fileName}.`);
    } catch (error) {
      console.error('[useCollectionTransfer] Export failed:', error);
      finish('Export failed', error instanceof Error ? error.message : 'The collection could not be exported.');
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (!assetService) return;
    setTransfer({ title: IMPORTING, progress: { message: 'Reading bundle…', fraction: 0 } });
    let result: CollectionImportResult;
    try {
      result = await importCollectionBundle(app, assetService, file, {
        onProgress: (progress) => setTransfer({ title: IMPORTING, progress }),
        confirmUpdate: async (request) => {
          setTransfer({ title: IMPORTING, progress: { message: 'Waiting for confirmation…', fraction: 0 }, isAwaitingConfirmation: true });
          const update = await confirmUpdate(request);
          setTransfer(update ? { title: IMPORTING, progress: { message: 'Updating…', fraction: 0 } } : null);
          return update;
        },
      });
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      finish('Import failed', error instanceof Error ? error.message : 'The collection could not be imported.');
      return;
    }
    if (result.outcome === 'kept') return;
    finish('Collection imported', describeImportResult(result));
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
