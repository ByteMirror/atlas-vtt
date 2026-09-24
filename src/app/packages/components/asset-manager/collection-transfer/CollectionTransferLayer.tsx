import React from 'react';
import { ProgressModal } from '../../primitives/ProgressModal';
import type { CollectionTransferActions } from '../hooks/useCollectionTransfer';
import { ExportCollectionDialog } from './ExportCollectionDialog';
import { ImportReviewDialog } from './ImportReviewDialog';

type CollectionTransferLayerProps = Pick<CollectionTransferActions, 'transfer' | 'confirmExport' | 'confirmImport' | 'closeTransfer'>;

/** The dialog of the export or import in progress, if any. */
export function CollectionTransferLayer({ transfer, confirmExport, confirmImport, closeTransfer }: CollectionTransferLayerProps): React.JSX.Element | null {
  switch (transfer?.step) {
    case 'working':
      return <ProgressModal title={transfer.title} message={transfer.progress.message} fraction={transfer.progress.fraction} />;
    case 'export-options':
      return <ExportCollectionDialog preview={transfer.preview} onExport={confirmExport} onCancel={closeTransfer} />;
    case 'import-review':
      return <ImportReviewDialog review={transfer.review} onConfirm={(decision) => { void confirmImport(decision); }} onCancel={closeTransfer} />;
    case 'done':
      return (
        <ProgressModal
          title={transfer.title}
          message={transfer.message}
          fraction={1}
          prompt={{ actions: [{ label: 'Close', onSelect: closeTransfer, isPrimary: true }], onDismiss: closeTransfer }}
        />
      );
    default:
      return null;
  }
}
