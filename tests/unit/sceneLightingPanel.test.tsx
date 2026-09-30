import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { SceneLightingPanelHost } from '../../src/app/pixi/lighting/SceneLightingPanel';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(cleanup);

function renderPanel(): { store: ViewAtlasStore; setSceneLighting: ReturnType<typeof vi.spyOn> } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `scene-lighting-panel-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  store.getState().setSceneLighting({ enabled: true });
  store.getState().setSceneLightingPanelOpen(true);
  const setSceneLighting = vi.spyOn(store.getState(), 'setSceneLighting');
  render(<ViewStoreProvider store={store}><TooltipProvider><SceneLightingPanelHost /></TooltipProvider></ViewStoreProvider>);
  return { store, setSceneLighting };
}

function toggleOf(label: string): Element {
  return screen.getByText(label).closest('.atlas-light-panel__toggle')!.querySelector('.atlas-toggle')!;
}

describe('SceneLightingPanel', () => {
  it('shows the scene options with their defaults', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Lighting settings' })).toBeTruthy();
    expect(toggleOf('Token vision').querySelector('.atlas-toggle__switch--on')).toBeTruthy();
    expect(toggleOf('Remember explored areas').querySelector('.atlas-toggle__switch--on')).toBeTruthy();
    expect((screen.getByLabelText('Explored colour') as HTMLInputElement).value).toBe('#ffffff');
    expect((screen.getByLabelText('Unexplored colour') as HTMLInputElement).value).toBe('#000000');
    expect(screen.getByText('Counts as lit from')).toBeTruthy();
    expect(screen.getByText('25 %')).toBeTruthy();
  });

  it('switches token vision and explored memory through setSceneLighting', () => {
    const { store, setSceneLighting } = renderPanel();
    fireEvent.click(toggleOf('Token vision'));
    expect(setSceneLighting).toHaveBeenCalledWith({ tokenVision: false });
    fireEvent.click(toggleOf('Remember explored areas'));
    expect(setSceneLighting).toHaveBeenCalledWith({ exploredMemory: false });
    expect(store.getState().lighting).toMatchObject({ tokenVision: false, exploredMemory: false });
  });

  it('sets the explored and unexplored colours', () => {
    const { store } = renderPanel();
    fireEvent.change(screen.getByLabelText('Explored colour'), { target: { value: '#aa7744' } });
    fireEvent.change(screen.getByLabelText('Unexplored colour'), { target: { value: '#102030' } });
    expect(store.getState().lighting).toMatchObject({ exploredColor: '#aa7744', unexploredColor: '#102030' });
  });

  it('sets from how much ambient light the scene counts as lit', () => {
    const { store, setSceneLighting } = renderPanel();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(setSceneLighting).toHaveBeenCalledWith({ litThreshold: 0.26 });
    expect(store.getState().lighting.litThreshold).toBe(0.26);
    expect(screen.getByText('26 %')).toBeTruthy();
  });

  it('closes', () => {
    const { store } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close lighting settings' }));
    expect(store.getState().isSceneLightingPanelOpen).toBe(false);
  });
});
