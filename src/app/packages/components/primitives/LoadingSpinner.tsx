import React from 'react';
import { cn } from '../../../../utils/cn';
import './loading-spinner.scss';

interface LoadingSpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * Accent comet orbiting a faint track. Animated with CSS transforms only, so it keeps
 * spinning on the compositor while the main thread is busy (e.g. decoding a map).
 * Decorative: pair it with text that says what is loading.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 56, className }): React.ReactElement => (
  <div
    className={cn('atlas-spinner', className)}
    style={{ '--atlas-spinner-size': `${size}px` } as React.CSSProperties}
    aria-hidden="true"
  >
    <div className="atlas-spinner__halo" />
    <div className="atlas-spinner__ring atlas-spinner__track" />
    <div className="atlas-spinner__orbit">
      <div className="atlas-spinner__comet">
        <div className="atlas-spinner__bloom">
          <div className="atlas-spinner__ring atlas-spinner__tail" />
        </div>
        <div className="atlas-spinner__ring atlas-spinner__tail" />
        <div className="atlas-spinner__head" />
      </div>
    </div>
  </div>
);
