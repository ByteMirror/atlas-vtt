import React from 'react';
import tokenRingImageUrl from '../../../assets/token-ring.webp';
import './token-portrait.scss';

interface TokenPortraitProps {
  src: string;
  alt: string;
  /** Tints the ring like the canvas does; untinted (white) when omitted. */
  ringColor?: string | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  /** Defer loading until the portrait nears the viewport, for long lists. */
  lazy?: boolean | undefined;
}

/** Circular token art framed by the same ring image the canvas draws. */
export function TokenPortrait({ src, alt, ringColor, className, style, lazy }: TokenPortraitProps): React.JSX.Element {
  const ringStyle = {
    '--atlas-token-ring-image': `url("${tokenRingImageUrl}")`,
    ...(ringColor ? { '--atlas-token-ring-color': ringColor } : {}),
  } as React.CSSProperties;

  return (
    <div className={`atlas-token-portrait ${className ?? ''}`} style={style}>
      <div className="atlas-token-image-wrapper">
        <img src={src} alt={alt} draggable={false} decoding="async" loading={lazy ? 'lazy' : undefined} />
      </div>
      <div className="atlas-token-ring" style={ringStyle} />
    </div>
  );
}
