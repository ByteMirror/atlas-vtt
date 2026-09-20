import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';

interface DestructiveActionRowProps {
  tokenId: string;
  store: StoreApi<ViewAtlasState>;
  hasHp: boolean;
  onClose: () => void;
}

function IconSpan({ name }: { name: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.replaceChildren();
      setIcon(ref.current, name);
    }
  }, [name]);
  return <span ref={ref} className="atlas-ctx-icon" />;
}

export function DestructiveActionRow({ tokenId, store, hasHp, onClose }: DestructiveActionRowProps): React.ReactElement {
  return (
    <div className="atlas-ctx-destructive-row">
      {hasHp && (
        <div
          role="menuitem"
          tabIndex={0}
          className="atlas-ctx-destructive-btn"
          onClick={(e) => {
            e.stopPropagation();
            store.getState().killTokens([tokenId]);
            onClose();
          }}
        >
          <IconSpan name="skull" />
          <span>Kill</span>
        </div>
      )}
      <div
        role="menuitem"
        tabIndex={0}
        className="atlas-ctx-destructive-btn"
        onClick={(e) => {
          e.stopPropagation();
          store.getState().deleteTokens([tokenId]);
          onClose();
        }}
      >
        <IconSpan name="trash" />
        <span>Delete</span>
      </div>
    </div>
  );
}
