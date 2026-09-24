import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContentItem, TokenPreview } from '../../../../services/collectionBundle/bundleContents';
import { StatblockHoverPreview, useStatblockHoverPreview } from '../../../../react/components/StatblockHoverPreview';
import type { ContentMedia } from './contentMedia';
import { itemState, withKeys, type ContentSelection } from './contentSelection';
import { TokenCard } from './TokenCard';
import { useTransferScroller } from './transferScroll';
import { VirtualGrid } from './VirtualGrid';

type TokenItem = ContentItem & { token: TokenPreview };

interface TokenGridProps {
  items: readonly ContentItem[];
  media: ContentMedia;
  selection?: ContentSelection | undefined;
}

/** Long enough that sweeping the pointer across the grid opens nothing. */
const HOVER_DELAY_MS = 350;

const isToken = (item: ContentItem): item is TokenItem => item.token !== undefined;

/**
 * Tokens as cards, rendered only as far as the pane shows them. Resting on a
 * token with a statblock opens the statblock beside it: from the vault when
 * exporting, from the file itself when importing.
 */
export function TokenGrid({ items, media, selection }: TokenGridProps): React.JSX.Element {
  const tokens = useMemo(() => items.filter(isToken), [items]);
  const scroller = useTransferScroller();
  const [preview, actions] = useStatblockHoverPreview<TokenItem>({ app: media.app });
  const [noteContent, setNoteContent] = useState<string>();
  const timer = useRef<number | null>(null);
  const request = useRef(0);
  const { showPreview, closePreview, clearPreview } = actions;

  const cancelPending = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    request.current += 1;
  }, []);

  const onHover = useCallback((item: TokenItem, card: HTMLElement): void => {
    cancelPending();
    const path = item.token.statblockPath;
    if (!path) return;
    const current = request.current;
    timer.current = window.setTimeout(() => {
      void media.noteText(path).then((text) => {
        if (current !== request.current) return;
        setNoteContent(text);
        showPreview(item, path, card);
      });
    }, HOVER_DELAY_MS);
  }, [cancelPending, media, showPreview]);

  const onLeave = useCallback((): void => {
    cancelPending();
    closePreview();
  }, [cancelPending, closePreview]);

  // The preview is placed beside the card; once the pane scrolls it would point at the wrong one.
  useEffect(() => {
    if (!scroller) return undefined;
    const onScroll = (): void => {
      cancelPending();
      clearPreview();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return (): void => scroller.removeEventListener('scroll', onScroll);
  }, [scroller, cancelPending, clearPreview]);

  useEffect(() => cancelPending, [cancelPending]);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onToggle = useCallback((key: string, include: boolean): void => {
    const current = selectionRef.current;
    if (current) current.onChange(withKeys(current.excluded, [key], include));
  }, []);

  return (
    <>
      <VirtualGrid
        items={tokens}
        minColumnWidth={96}
        rowHeight={120}
        rowGap={8}
        columnGap={8}
        className="atlas-transfer-token-grid"
        itemKey={(item) => item.key}
        renderItem={(item) => (
          <TokenCard item={item} state={itemState(selection, item.key)} media={media} onToggle={onToggle} onHover={onHover} onLeave={onLeave} />
        )}
      />
      <StatblockHoverPreview
        className="statblock-hover-preview--over-modal"
        app={media.app}
        notePath={preview.notePath}
        noteContent={noteContent}
        isVisible={preview.isVisible}
        isClosing={preview.isClosing}
        position={preview.position}
        anchorRect={preview.anchorRect}
        preferredSide="right"
      />
    </>
  );
}
