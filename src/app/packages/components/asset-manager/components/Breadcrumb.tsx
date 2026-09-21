import React, { useId } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { Tab, Folder as FolderType } from '../types';
import { getTabDisplayName } from '../types';

export interface BreadcrumbProps {
  activeTab: Tab;
  selectedFolderId: string;
  getFolderPath: (folderId: string) => FolderType[];
  onNavigateToFolder: (folderId: string | null) => void;
}

/** Path from the tab root to the open folder. The last segment is the current location. */
export function Breadcrumb({
  activeTab, selectedFolderId, getFolderPath, onNavigateToFolder,
}: BreadcrumbProps): React.JSX.Element {
  const path = getFolderPath(selectedFolderId);
  const labelId = useId();

  return (
    <nav className="atlas-asset-manager-breadcrumb" aria-labelledby={labelId}>
      <span id={labelId} hidden>Folder path</span>
      <button type="button" className="atlas-breadcrumb-btn" onClick={() => onNavigateToFolder(null)}>
        <span>{getTabDisplayName(activeTab)}</span>
      </button>
      {path.map((segment, index) => {
        const isCurrent = index === path.length - 1;
        return (
          <React.Fragment key={segment.id}>
            <ChevronRight className="atlas-breadcrumb-separator" />
            <button
              type="button"
              className={`atlas-breadcrumb-btn ${isCurrent ? 'atlas-current' : ''}`}
              onClick={() => onNavigateToFolder(segment.id)}
              aria-current={isCurrent ? 'location' : undefined}
            >
              <Folder />
              <span>{segment.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
