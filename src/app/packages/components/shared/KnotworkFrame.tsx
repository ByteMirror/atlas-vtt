import React, { useId } from 'react';
import { KNOT_PATHS } from './knotworkPaths';
import './knotwork-frame.scss';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

interface KnotworkFrameProps {
  /** Extra class on every corner, for a surface that sizes or tints its own. */
  className?: string | undefined;
}

/**
 * The four knotwork corners of an ornate surface, drawn from one definition and
 * mirrored into place. Size, inset, colour and opacity come from the surface via
 * `atlas-knotwork-frame` (`styles/_mixins.scss`); this only places them.
 *
 * The frame carries its own definition rather than sharing one per document, so
 * it works wherever it is mounted — the main window, a popout player window, or
 * a detached preview — with no id colliding between them.
 */
export function KnotworkFrame({ className }: KnotworkFrameProps): React.JSX.Element {
  const id = useId();

  return (
    <>
      <svg className="atlas-knotwork-defs" aria-hidden="true">
        <defs>
          <g id={id} fill="none" stroke="currentColor" strokeWidth="10">
            {KNOT_PATHS.map((d, index) => (
              <path key={index} d={d} />
            ))}
          </g>
        </defs>
      </svg>
      {CORNERS.map((corner) => (
        <svg
          key={corner}
          className={`atlas-knotwork-corner atlas-knotwork-corner--${corner} ${className ?? ''}`}
          viewBox="188 0 260 260"
          aria-hidden="true"
        >
          <use href={`#${id}`} />
        </svg>
      ))}
    </>
  );
}
