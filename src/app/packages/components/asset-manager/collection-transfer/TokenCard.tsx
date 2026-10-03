import React, { memo } from 'react';
import { ScrollText } from 'lucide-react';
import type { ContentItem, TokenPreview } from '../../../../services/collectionBundle/bundleContents';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { Skeleton } from '../../primitives/Skeleton';
import type { ContentMedia } from './contentMedia';
import { Checkbox, type ItemState } from './contentSelection';
import { useContentImage } from './useContentImage';

interface TokenCardProps {
  item: ContentItem & { token: TokenPreview };
  state: ItemState;
  media: ContentMedia;
  onToggle: (key: string, include: boolean) => void;
}

/**
 * A token as it looks when spawned (its art, framed by the ring unless it has
 * none) with its name. Tokens with a statblock carry its badge; the grid opens it.
 */
export const TokenCard = memo(function TokenCard({ item, state, media, onToggle }: TokenCardProps): React.JSX.Element {
  const { token } = item;
  const image = useContentImage(media, [token.thumbnailPath, token.imagePath]);
  const body = (
    <>
      <span className="atlas-transfer-token__portrait">
        {image.url
          ? <TokenPortrait src={image.url} alt="" showRing={token.showRing} reveal />
          : <Skeleton shape="circle" className="atlas-transfer-token__placeholder" live={image.pending} />}
        {token.statblockPath && <span className="atlas-transfer-token__statblock" aria-hidden="true"><ScrollText /></span>}
      </span>
      <span className="atlas-transfer-token__name">{item.name}</span>
    </>
  );
  return (
    <div
      className="atlas-transfer-token"
      role="listitem"
      data-state={state}
      data-item-key={item.key}
    >
      {state === undefined ? <div className="atlas-transfer-token__body">{body}</div> : (
        <label className="atlas-transfer-token__body">
          <Checkbox
            className="atlas-transfer-token__check"
            checked={state === 'included'}
            disabled={state === 'orphaned'}
            onChange={(event) => onToggle(item.key, event.target.checked)}
          />
          {body}
        </label>
      )}
    </div>
  );
});
