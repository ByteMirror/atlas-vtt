import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from '../packages/components/primitives/CloseButton';
import type { SettingsService } from '../services/SettingsService';
import { useAtlasSettings } from './useMapHotkeys';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey } from './mapHotkeys';
import { useDialogFocus } from '../onboarding/useDialogFocus';

export function HotkeyHelp({ settings: explicit, onClose, isPlayerView = false }: { settings?: SettingsService | undefined; onClose: () => void; isPlayerView?: boolean }): React.JSX.Element {
  const settings = useAtlasSettings(explicit);
  const bindings = settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, onClose);
  const actions = availableHotkeys(isPlayerView);
  return createPortal(<div className="atlas-vtt-plugin atlas-vtt-root atlas-hotkey-help" onClick={onClose}>
    <div ref={ref} className="atlas-hotkey-help-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
      <div className="atlas-hotkey-help-header">
        <h2 id={titleId}>Map keyboard shortcuts</h2>
        <CloseButton onClick={onClose} aria-label="Close keyboard shortcuts" />
      </div>
      <p>Active only while viewing an Atlas map. Change these in Obsidian Settings → Atlas VTT → Map hotkeys.</p>
      <div className="atlas-hotkey-help-list">
        {Array.from(new Set(actions.map(action => action.group))).map(group => <section key={group}>
          <h3>{group}</h3>
          <dl>{actions.filter(action => action.group === group).map(action => <div key={action.id}><dt>{action.label}</dt><dd><kbd>{formatHotkey(bindings[action.id])}</kbd></dd></div>)}</dl>
        </section>)}
        <section>
          <h3>Navigation &amp; interactions</h3>
          <dl>
            <div><dt>Move grid alignment</dt><dd><kbd>Arrow keys</kbd></dd></div>
            <div><dt>Fine grid alignment</dt><dd><kbd>Shift + Arrow keys</kbd></dd></div>
            <div><dt>Preview initiative statblock</dt><dd><kbd>Ctrl/Cmd</kbd> + hover</dd></div>
            <div><dt>Drag out a copy of tokens</dt><dd><kbd>Alt/Option</kbd> + drag</dd></div>
            <div><dt>Open map in both views (map switcher)</dt><dd><kbd>Shift + Enter</kbd></dd></div>
            <div><dt>Add a waypoint to a token's measured path</dt><dd><kbd>Space</kbd> while dragging</dd></div>
            <div><dt>Close dialog</dt><dd><kbd>Escape</kbd></dd></div>
            <div><dt>Navigate menus</dt><dd><kbd>Tab</kbd> / <kbd>Arrow keys</kbd></dd></div>
          </dl>
        </section>
      </div>
    </div>
  </div>, document.body);
}
