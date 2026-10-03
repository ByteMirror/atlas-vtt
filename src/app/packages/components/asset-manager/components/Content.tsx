import React, { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { tabs, type Tab } from '../types';
import { TooltipProvider } from '../../primitives/tooltip';
import { ContentPane, type ContentPaneProps } from './ContentPane';
import { ContentSkeleton } from './ContentSkeleton';
import { paneVariants } from './gridMotion';

export interface ContentProps extends ContentPaneProps {
  /** The open folder; null at the tab's root. */
  selectedFolderId: string | null;
  /** How many folders deep the open folder is; 0 at the tab's root. */
  folderDepth: number;
  /** Search, tag filter and sort of the list; changing it swaps the pane in place. */
  refinement: string;
  /** The assets of this place are not loaded yet: the pane shows no content of its own. */
  loading: boolean;
  /** Whether a pane that is loading shows its skeleton already (`useLoadingReveal`); until then it is empty. */
  showSkeleton: boolean;
  /** How many assets the tab holds, for the skeleton; null while that is not known. */
  assetCount: number | null;
}

interface PanePlace {
  key: string;
  tab: Tab;
  depth: number;
  /** 1 deeper into the folder tree or to a tab further right, -1 back out or left, 0 sideways. */
  direction: number;
}

/**
 * The pane of the open folder and its refinement, and the direction it was
 * reached from. The direction is kept until the next change of pane, so the
 * pane leaving and the pane arriving agree on it for their whole transition.
 * A new refinement of the same folder keeps its depth, so it crossfades.
 */
function usePanePlace(tab: Tab, folderId: string | null, depth: number, refinement: string): PanePlace {
  const key = `${tab}/${folderId ?? ''}?${refinement}`;
  const [place, setPlace] = useState<PanePlace>({ key, tab, depth, direction: 0 });
  if (place.key === key) return place;
  const direction = tab === place.tab
    ? Math.sign(depth - place.depth)
    : Math.sign(tabs.indexOf(tab) - tabs.indexOf(place.tab));
  const next = { key, tab, depth, direction };
  setPlace(next);
  return next;
}

/**
 * The asset manager's content area. Opening a folder, going back or switching
 * tabs slides the new pane in from the side it lies on; searching, filtering by
 * tags or sorting crossfades to a new pane of the same folder. A place that is
 * loading shows its skeleton in the pane its content will have, so the cards
 * take the place of their placeholders without a transition between them.
 */
export function Content({
  selectedFolderId, folderDepth, refinement, loading, showSkeleton, assetCount, ...paneProps
}: ContentProps): React.JSX.Element {
  const place = usePanePlace(paneProps.activeTab, selectedFolderId, folderDepth, refinement);

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={800} skipDelayDuration={0}>
        <AnimatePresence initial={false} custom={place.direction}>
          <motion.div
            key={place.key}
            className="atlas-asset-manager-pane"
            custom={place.direction}
            variants={paneVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {!loading && <ContentPane {...paneProps} />}
            {loading && showSkeleton && (
              <ContentSkeleton tab={paneProps.activeTab} folderCount={paneProps.folders.length} assetCount={assetCount} />
            )}
          </motion.div>
        </AnimatePresence>
      </TooltipProvider>
    </MotionConfig>
  );
}
