import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';

const { openSceneBrowser } = vi.hoisted(() => ({ openSceneBrowser: vi.fn() }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ view: { openSceneBrowser }, app: {} }),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isShortcutScopeActive: () => true }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));

import { CommandPalette } from '../../src/app/react/components/CommandPalette';

describe('Atlas search actions', () => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it.each(['scene', 'asset manager', 'toggle'])('finds and opens the scene browser for "%s"', (query) => {
    const setActiveTool = vi.fn();
    const onClose = vi.fn();
    const store = create(() => ({ setActiveTool }));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.change(screen.getByPlaceholderText('Search commands...'), { target: { value: query } });
    fireEvent.click(screen.getByRole('button', { name: 'Open scene browser' }));

    expect(openSceneBrowser).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it.each([
    { initiallyOpen: false, activation: 'click' },
    { initiallyOpen: true, activation: 'click' },
    { initiallyOpen: false, activation: 'keyboard' },
    { initiallyOpen: true, activation: 'keyboard' },
  ])('opens the dice log and closes search ($activation, initially open: $initiallyOpen)', ({ initiallyOpen, activation }) => {
    const setDiceLogOpen = vi.fn();
    const onClose = vi.fn();
    const store = create(() => ({ isDiceLogOpen: initiallyOpen, setDiceLogOpen }));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'dice log' } });
    const action = screen.getByRole('button', { name: /Open dice log/ });
    expect(action.querySelector('.atlas-command-item-toggle')).toBeNull();

    if (activation === 'click') fireEvent.click(action);
    else fireEvent.keyDown(input, { key: 'Enter' });

    expect(setDiceLogOpen).toHaveBeenCalledExactlyOnceWith(true);
    expect(onClose).toHaveBeenCalled();
  });
});
