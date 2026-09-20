import React from 'react';
import { WIDGET_ICON_PATHS, resolveWidgetIcon } from '../../types/widgetIcons';

interface WidgetIconGlyphProps {
  icon: string | undefined;
  size?: number;
  color?: string;
}

export function WidgetIconGlyph({ icon, size = 20, color }: WidgetIconGlyphProps): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" style={{ color }} aria-hidden="true">
      <path d={WIDGET_ICON_PATHS[resolveWidgetIcon(icon)]} />
    </svg>
  );
}
