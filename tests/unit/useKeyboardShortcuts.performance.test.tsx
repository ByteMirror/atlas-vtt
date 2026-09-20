import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../src/app/services/use-keyboard-shortcuts';

interface HarnessProps {
  shortcuts: Record<string, (event: KeyboardEvent) => void>;
  viewId?: string;
}

function HookHarness({ shortcuts, viewId }: HarnessProps): React.ReactElement {
  useKeyboardShortcuts(shortcuts, viewId);
  return <div data-testid="hook-harness" />;
}

describe('useKeyboardShortcuts performance guards', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active">
        <div class="atlas-react-ui-container" data-view-id="view-1"></div>
      </div>
    `;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses the latest shortcut map after rerenders', () => {
    const aHandler = vi.fn();

    const { rerender, unmount } = render(<HookHarness shortcuts={{ a: aHandler }} viewId="view-1" />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(aHandler).toHaveBeenCalledTimes(1);

    const bHandler = vi.fn();
    rerender(<HookHarness shortcuts={{ b: bHandler }} viewId="view-1" />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(aHandler).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(bHandler).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('skips expensive DOM checks for unrelated key presses', () => {
    const querySpy = vi.spyOn(document, 'querySelector');
    const handler = vi.fn();

    render(<HookHarness shortcuts={{ a: handler }} />);
    querySpy.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));

    expect(handler).not.toHaveBeenCalled();
    expect(querySpy).not.toHaveBeenCalled();
  });
});
