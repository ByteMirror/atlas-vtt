import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianMenuDropdown } from '../../src/app/packages/components/shared/ObsidianMenuDropdown';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';

describe('settings dropdown interactions', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('still opens and selects an option after another map menu provider unmounts', async () => {
    const onChange = vi.fn();
    const view = render(
      <ContextMenuProvider>
        <ObsidianMenuDropdown value="square" options={{ square: 'Square', hex: 'Hex (Flat)' }} onChange={onChange} />
      </ContextMenuProvider>,
    );
    const otherMap = render(<ContextMenuProvider><div>Other map</div></ContextMenuProvider>);
    otherMap.unmount();

    const trigger = view.container.querySelector('.text-icon-button') as HTMLElement;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    const option = await screen.findByRole('menuitemcheckbox', { name: 'Hex (Flat)' });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('hex');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('opens from the keyboard and restores focus on Escape without a map provider', async () => {
    const view = render(<ObsidianMenuDropdown value="Square" options={['Square', 'Hex (Flat)']} onChange={vi.fn()} />);
    const trigger = view.container.querySelector('.text-icon-button') as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(await screen.findByRole('menu')).toBeTruthy();
    const parentKeyDown = vi.fn();
    document.addEventListener('keydown', parentKeyDown);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    document.removeEventListener('keydown', parentKeyDown);
    expect(parentKeyDown).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
