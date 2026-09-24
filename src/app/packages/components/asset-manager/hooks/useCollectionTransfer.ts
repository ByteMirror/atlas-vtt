import { useEffect, useRef, useState } from 'react';
import { Notice, type App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { BundleProgress, BundleProgressListener } from '../../../../services/collectionBundle/bundleProgress';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice, type ExportPreview } from '../../../../services/collectionBundle/collectionExport';
import { openCollectionImport, type CollectionImportResult, type ImportDecision, type ImportSession } from '../../../../services/collectionBundle/collectionImport';
import type { BundleFileReader } from '../../../../services/collectionBundle/bundleReader';
import type { ImportReview } from '../../../../services/collectionBundle/importReview';
import { describeError } from '../../../../utils/errors';
import { plural } from '../../../../utils/plural';

/** Where an export or import stands; the asset manager blocks while one is set. */
export type CollectionTransfer =
  | { step: 'working'; title: string; progress: BundleProgress }
  | { step: 'export-options'; preview: ExportPreview }
  | { step: 'import-review'; review: ImportReview; files: BundleFileReader }
  | { step: 'done'; title: string; message: string };

export interface CollectionTransferActions {
  transfer: CollectionTransfer | null;
  handleExportCollection: () => Promise<void>;
  handleImportCollection: () => void;
  confirmExport: (choice: ExportChoice) => Promise<string | null>;
  confirmImport: (decision: ImportDecision) => Promise<void>;
  closeTransfer: () => void;
}

interface Deps {
  app: ObsidianApp;
  assetService: AssetService | null;
  selectedCollection: string | null;
  /** Called with the id of the collection an import or fork created or updated. */
  onImported: (collectionId: string) => Promise<void>;
}

const EXPORTING = 'Exporting collection';
const IMPORTING = 'Importing collection';

function describeImport(result: CollectionImportResult): string {
  const name = `“${result.collectionName}” v${result.version}`;
  if (result.created) return `Imported ${name}.`;
  const parts = [`${plural(result.written, 'file')} written`, `${plural(result.removed, 'file')} removed`];
  if (result.keptLocal > 0) parts.push(`${plural(result.keptLocal, 'item')} kept as you had them`);
  const backup = result.backupCount > 0 ? ` Replaced files were backed up to ${result.backupFolder}.` : '';
  return `Updated ${name}: ${parts.join(', ')}.${backup}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.body.createEl('a', { href: url, attr: { download: fileName } });
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Drives exporting the selected collection and importing bundles: progress,
 * the export options and import review dialogs, and the final result.
 */
export function useCollectionTransfer({ app, assetService, selectedCollection, onImported }: Deps): CollectionTransferActions {
  const [transfer, setTransfer] = useState<CollectionTransfer | null>(null);
  const session = useRef<ImportSession | null>(null);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return (): void => { isMounted.current = false; };
  }, []);

  const working = (title: string): BundleProgressListener => (progress) => setTransfer({ step: 'working', title, progress });

  const closeTransfer = (): void => {
    session.current = null;
    setTransfer(null);
  };

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (title: string, message: string): void => {
    session.current = null;
    // An update can close the map view hosting this asset manager; the result must still reach the user.
    if (!isMounted.current) {
      new Notice(message);
      return;
    }
    setTransfer({ step: 'done', title, message });
  };

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || !selectedCollection || transfer) return;
    setTransfer({ step: 'working', title: EXPORTING, progress: { message: 'Checking the collection…', fraction: 0 } });
    try {
      setTransfer({ step: 'export-options', preview: await prepareCollectionExport(app, assetService, selectedCollection) });
    } catch (error) {
      console.error('[useCollectionTransfer] Export preparation failed:', error);
      finish('Export failed', describeError(error));
    }
  };

  const confirmExport = async (choice: ExportChoice): Promise<string | null> => {
    if (!assetService || transfer?.step !== 'export-options') return null;
    const { preview } = transfer;
    if (choice.kind === 'fork' && await assetService.isCollectionNameTaken(choice.name, preview.collection.id)) {
      return `A collection named “${choice.name.trim()}” already exists.`;
    }
    setTransfer({ step: 'working', title: EXPORTING, progress: { message: 'Preparing…', fraction: 0 } });
    try {
      const bundle = await exportCollectionBundle(app, assetService, preview, choice, working(EXPORTING));
      downloadBlob(bundle.blob, bundle.fileName);
      const packed = `Packed “${bundle.collectionName}” v${bundle.version} (${plural(bundle.assetCount, 'asset')}, ${plural(bundle.fileCount, 'file')}) into ${bundle.fileName}.`;
      try {
        await bundle.commit();
      } catch (error) {
        // The file is out already; only recording the release here failed.
        console.error('[useCollectionTransfer] Recording the release failed:', error);
        finish('Collection exported', `${packed} This vault could not record the release (${describeError(error)}), so export it again before sharing another version.`);
        return null;
      }
      finish('Collection exported', packed);
      if (choice.kind === 'fork') await onImported(preview.collection.id);
    } catch (error) {
      console.error('[useCollectionTransfer] Export failed:', error);
      finish('Export failed', describeError(error));
    }
    return null;
  };

  const importFile = async (file: File): Promise<void> => {
    if (!assetService) return;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: 'Reading bundle…', fraction: 0 } });
    try {
      session.current = await openCollectionImport(app, assetService, file, working(IMPORTING));
      setTransfer({ step: 'import-review', review: session.current.review, files: session.current.files });
    } catch (error) {
      console.error('[useCollectionTransfer] Reading the bundle failed:', error);
      finish('Import failed', describeError(error));
    }
  };

  const confirmImport = async (decision: ImportDecision): Promise<void> => {
    const current = session.current;
    if (!current) return;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: 'Writing…', fraction: 0 } });
    let result: CollectionImportResult;
    try {
      result = await current.apply(decision, working(IMPORTING));
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      finish('Import failed', describeError(error));
      return;
    }
    finish(result.created ? 'Collection imported' : 'Collection updated', describeImport(result));
    // The import is complete; a failed refresh must not report it as failed.
    try {
      await onImported(result.collectionId);
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

  return { transfer, handleExportCollection, handleImportCollection, confirmExport, confirmImport, closeTransfer };
}
