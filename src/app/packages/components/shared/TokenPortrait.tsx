import React from 'react';
import tokenRingImageUrl from '../../../assets/token-ring.webp';
import { RevealImage } from '../primitives/RevealImage';
import { Skeleton } from '../primitives/Skeleton';
import './token-portrait.scss';

interface TokenPortraitProps {
  /** The art; ignored while `pending`. */
  src: string;
  showRing?: boolean | undefined;
  alt: string;
  /** Tints the ring like the canvas does; untinted (white) when omitted. */
  ringColor?: string | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  /** Defer loading until the portrait nears the viewport, for long lists. */
  lazy?: boolean | undefined;
  /** Holds the art's place with a placeholder until it can be painted, then fades it in. */
  reveal?: boolean | undefined;
  /** The art is not there yet: the frame shows its placeholder alone. */
  pending?: boolean | undefined;
}

function Art({ src, alt, lazy, reveal, pending }: Pick<TokenPortraitProps, 'src' | 'alt' | 'lazy' | 'reveal' | 'pending'>): React.JSX.Element {
  if (pending) return <Skeleton className="atlas-image-placeholder" live />;
  if (reveal) return <RevealImage src={src} alt={alt} lazy={lazy} />;
  return <img src={src} alt={alt} draggable={false} decoding="async" loading={lazy ? 'lazy' : undefined} />;
}

/** Circular token art framed by the same ring image the canvas draws. */
export function TokenPortrait({ src, alt, ringColor, showRing = true, className, style, lazy, reveal, pending }: TokenPortraitProps): React.JSX.Element {
  const ringStyle = {
    '--atlas-token-ring-image': `url("${tokenRingImageUrl}")`,
    ...(ringColor ? { '--atlas-token-ring-color': ringColor } : {}),
  } as React.CSSProperties;

  return (
    <div className={`atlas-token-portrait ${showRing ? '' : 'atlas-token-portrait--unframed'} ${className ?? ''}`} style={style}>
      <div className="atlas-token-image-wrapper">
        <Art src={src} alt={alt} lazy={lazy} reveal={reveal} pending={pending} />
      </div>
      {showRing && <div className="atlas-token-ring" style={ringStyle} />}
    </div>
  );
}
