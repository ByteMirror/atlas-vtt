import React, { useState } from 'react';
import { useScrollbarGutter } from '../../../packages/components/primitives/useScrollbarGutter';

/**
 * The scrolling area of the collection settings dialog that holds the open tab.
 * Its scrollbar lies inside the padding, so a tab that starts to scroll does not move.
 */
export function SettingsContent({ children }: { children: React.ReactNode }): React.ReactElement {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  useScrollbarGutter(content);
  return <div ref={setContent} className="atlas-collection-settings-content">{children}</div>;
}
