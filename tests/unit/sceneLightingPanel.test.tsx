import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { SceneLightingPanelHost } from '../../src/app/pixi/lighting/SceneLightingPanel';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

function toggleOf(label: string): HTMLElement {
  return screen.getByRole('switch', { name: label });
}

describe('SceneLightingPanel', () => {
  it('shows the scene options with their defaults', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Lighting settings' })).toBeTruthy();
    expect(toggleOf('Token vision').getAttribute('aria-checked')).toBe('true');
    expect(toggleOf('Remember explored areas').getAttribute('aria-checked')).toBe('true');
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

  it('switches from the keyboard', () => {
    const { store } = renderPanel();
    fireEvent.keyDown(toggleOf('Token vision'), { key: ' ' });
    expect(store.getState().lighting.tokenVision).toBe(false);
    fireEvent.keyDown(toggleOf('Token vision'), { key: 'Enter' });
    expect(store.getState().lighting.tokenVision).toBe(true);
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

  it('shows the threshold while it is dragged and sets it only on release', () => {
    // jsdom has no PointerEvent; the slider reads the pointer's position from it.
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    });
    const { store, setSceneLighting } = renderPanel();
    const slider = screen.getByRole('slider').closest('.slider-root') as HTMLElement;
    slider.getBoundingClientRect = (): DOMRect => ({ left: 0, right: 100, top: 0, bottom: 10, width: 100, height: 10, x: 0, y: 0, toJSON: () => ({}) });
    let captured = false;
    slider.setPointerCapture = (): void => { captured = true; };
    slider.hasPointerCapture = (): boolean => captured;
    slider.releasePointerCapture = (): void => { captured = false; };

    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 10 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 60 });
    expect(screen.getByText('60 %')).toBeTruthy();
    expect(setSceneLighting).not.toHaveBeenCalled();
    expect(store.getState().lighting.litThreshold).toBeUndefined();

    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 60 });
    expect(setSceneLighting).toHaveBeenCalledTimes(1);
    expect(setSceneLighting).toHaveBeenCalledWith({ litThreshold: 0.6 });
    expect(screen.getByText('60 %')).toBeTruthy();
  });

  it('closes', () => {
    const { store } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close lighting settings' }));
    expect(store.getState().isSceneLightingPanelOpen).toBe(false);
  });
});
