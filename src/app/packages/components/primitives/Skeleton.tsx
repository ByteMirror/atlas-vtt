import React, { useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import { skeletonPhaseStyle } from './skeletonPhase';
import './skeleton.scss';

export type SkeletonShape = 'block' | 'circle' | 'pill' | 'text';

interface SkeletonProps {
  shape?: SkeletonShape;
  /** CSS width; a text bar without one would have none. */
  width?: string | number;
  /** Breathes on its own: for a piece that is late inside content already shown. */
  live?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One placeholder shape. Decorative: the `SkeletonGroup` around it says what is
 * loading. Sized by its class or by `width`; a `text` bar takes its height from
 * the font of the line it stands in.
 */
export function Skeleton({ shape = 'block', width, live = false, className, style }: SkeletonProps): React.JSX.Element {
  // Taken when the breath begins, which may be later than the mount.
  const phase = useMemo(() => (live ? skeletonPhaseStyle() : undefined), [live]);
  return (
    <span
      className={cn('atlas-skeleton', className)}
      data-shape={shape}
      data-live={live || undefined}
      style={{ ...phase, ...style, ...(width !== undefined && { width }) }}
      aria-hidden="true"
    />
  );
}

interface SkeletonGroupProps {
  /**
   * What is loading, for assistive technology ("Loading characters"). Leave it
   * out where something beside the group already says so, such as a progress line.
   */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

/**
 * A surface whose content is loading. One sheen passes over all of its shapes,
 * moved by a single transform, so it stays smooth while the content loads.
 */
export function SkeletonGroup({ label, className, style, ref, children }: SkeletonGroupProps): React.JSX.Element {
  const announced = label === undefined ? { 'aria-hidden': true } : { role: 'status', 'aria-busy': true };
  return (
    <div ref={ref} className={cn('atlas-skeleton-group', className)} style={style} {...announced}>
      {label !== undefined && <span className="atlas-skeleton-label">{label}</span>}
      {children}
    </div>
  );
}

/** Widths of the text bars of a list, so its rows do not look stamped; repeats after six. */
const TEXT_WIDTHS = [62, 78, 54, 70, 46, 66] as const;

/** The width of the `index`th text bar of a list, as a share of `max`. */
export function skeletonTextWidth(index: number, max = 100): string {
  const share = TEXT_WIDTHS[index % TEXT_WIDTHS.length] ?? TEXT_WIDTHS[0];
  return `${Math.round((share * max) / 100)}%`;
}
