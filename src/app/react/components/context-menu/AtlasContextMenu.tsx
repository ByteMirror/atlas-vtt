import React, { useEffect, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { setIcon } from 'obsidian';
import { runInBackground } from '../../../utils/backgroundTask';
import './atlas-context-menu.scss';

// ── Entry descriptor (declarative menu definition) ──────────────────────────

// `onClick` may be async: the menu logs a rejected action rather than leaving it unhandled.
export type ContextMenuEntry =
  | { type: 'item'; label: string; icon?: string; onClick: () => unknown; checked?: boolean; disabled?: boolean; destructive?: boolean }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; icon?: string; children: ContextMenuEntry[] }
  | { type: 'custom'; render: () => React.ReactNode };

type ContextMenuItemEntry = Extract<ContextMenuEntry, { type: 'item' }>;

/** Runs an entry's action; a rejected async action is logged rather than left unhandled. */
function runEntryAction(entry: ContextMenuItemEntry): void {
  const result = entry.onClick();
  if (result instanceof Promise) {
    runInBackground(result, `Context menu action "${entry.label}"`);
  }
}

// ── Icon helper ─────────────────────────────────────────────────────────────

function ObsidianIcon({ name }: { name: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      while (ref.current.firstChild) {
        ref.current.removeChild(ref.current.firstChild);
      }
      setIcon(ref.current, name);
    }
  }, [name]);

  return <span ref={ref} className="atlas-ctx-icon" />;
}

// ── Render entries recursively ──────────────────────────────────────────────

export function renderEntries(
  entries: ContextMenuEntry[],
  onClose: () => void,
): React.ReactNode[] {
  return entries.map((entry, idx) => {
    switch (entry.type) {
      case 'separator':
        return <DropdownMenu.Separator key={`sep-${idx}`} className="atlas-ctx-separator" />;

      case 'custom':
        return (
          <div key={`custom-${idx}`} className="atlas-ctx-custom" role="none">
            {entry.render()}
          </div>
        );

      case 'submenu':
        return (
          <DropdownMenu.Sub key={`sub-${idx}`}>
            <DropdownMenu.SubTrigger
              className={`atlas-ctx-item atlas-ctx-submenu-trigger`}
            >
              <span className="atlas-ctx-item__leading">
                {entry.icon ? <ObsidianIcon name={entry.icon} /> : <span className="atlas-ctx-icon-spacer" />}
                <span className="atlas-ctx-item__label">{entry.label}</span>
              </span>
              <span className="atlas-ctx-item__trailing">
                <ObsidianIcon name="chevron-right" />
              </span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="atlas-ctx-menu"
                sideOffset={4}
                alignOffset={-4}
                avoidCollisions
                collisionPadding={8}
              >
                {renderEntries(entry.children, onClose)}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        );

      case 'item':
      default: {
        if (entry.checked !== undefined) {
          return (
            <DropdownMenu.CheckboxItem
              key={`check-${idx}`}
              className={`atlas-ctx-item${entry.destructive ? ' atlas-ctx-item--destructive' : ''}`}
              checked={entry.checked}
              {...(entry.disabled !== undefined ? { disabled: entry.disabled } : {})}
              onSelect={() => {
                runEntryAction(entry);
                onClose();
              }}
            >
              {entry.label}
            </DropdownMenu.CheckboxItem>
          );
        }

        return (
          <DropdownMenu.Item
            key={`item-${idx}`}
            className={`atlas-ctx-item${entry.destructive ? ' atlas-ctx-item--destructive' : ''}`}
            {...(entry.disabled !== undefined ? { disabled: entry.disabled } : {})}
            onSelect={() => {
              runEntryAction(entry);
              onClose();
            }}
          >
            {entry.label}
          </DropdownMenu.Item>
        );
      }
    }
  });
}
