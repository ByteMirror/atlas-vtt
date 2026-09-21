import React, { useEffect, useRef, useState } from 'react';
import { LabelTooltip } from '../primitives/tooltip';

export function calculateAutoFitFontSize({
  containerWidth,
  textWidth,
  minFontSize,
  maxFontSize,
}: {
  containerWidth: number;
  textWidth: number;
  minFontSize: number;
  maxFontSize: number;
}): number {
  if (containerWidth <= 0 || textWidth <= 0 || textWidth <= containerWidth) {
    return maxFontSize;
  }

  const scale = containerWidth / textWidth;
  return Math.max(minFontSize, Math.floor(maxFontSize * scale));
}

export const AutoFitText: React.FC<{
  children: string | number;
  className?: string;
  minFontSize?: number;
  maxFontSize?: number;
  truncate?: boolean;
  title?: string;
}> = ({
  children,
  className = '',
  minFontSize = 12,
  maxFontSize = 24,
  truncate = false,
  title,
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;

    if (!container || !text) {
      return;
    }

    let frameId = 0;

    const updateFontSize = (): void => {
      frameId = window.requestAnimationFrame(() => {
        setFontSize(calculateAutoFitFontSize({
          containerWidth: container.offsetWidth,
          textWidth: text.scrollWidth,
          minFontSize,
          maxFontSize,
        }));
      });
    };

    setFontSize(maxFontSize);
    updateFontSize();

    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(frameId);
    }

    const observer = new ResizeObserver(() => {
      updateFontSize();
    });
    observer.observe(container);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [children, minFontSize, maxFontSize]);

  const content = (
    <span
      ref={containerRef}
      className={[
        'atlas-auto-fit-text',
        truncate ? 'atlas-auto-fit-text--truncate' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ fontSize: `${fontSize}px` }}
    >
      <span ref={textRef} className="atlas-auto-fit-text-inner">
        {children}
      </span>
    </span>
  );

  return title ? <LabelTooltip label={title}>{content}</LabelTooltip> : content;
};
