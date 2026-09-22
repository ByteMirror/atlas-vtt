import { App } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { Application } from 'pixi.js';
import { UIRoot } from './UIRoot';
import { ViewStoreProvider } from './ViewStoreContext';
import type { ViewAtlasStore } from '../storeFactory';
import type { AtlasView } from '../atlas-view';

// Store multiple React roots keyed by container element
const reactRoots = new WeakMap<HTMLElement, Root>();

/**
 * Mount the React UI components into the provided container
 */
export function mountUI(
  app: App,
  container: HTMLElement,
  view: AtlasView,
  pixiApp: Application | null,
  store: ViewAtlasStore
): void {
  // Check if this container already has a React root
  const existingRoot = reactRoots.get(container);
  
  // Rendered without React.StrictMode: its development-only double invocation of effects has not
  // been verified against the effects that create PIXI objects and Obsidian leaves.
  const element = React.createElement(
    ViewStoreProvider,
    { store, children: React.createElement(UIRoot, { app, view, pixiApp }) }
  );
  
  if (existingRoot) {
    existingRoot.render(element);
    return;
  }

  try {
    const reactRoot = createRoot(container);
    reactRoots.set(container, reactRoot);
    reactRoot.render(element);
  } catch (error) {
    console.error('[React Mount] Error mounting React tree:', error);
    throw error;
  }
}

/**
 * Unmount and cleanup the React UI components for a specific container
 */
export function unmountUI(container?: HTMLElement): void {
  if (container) {
    const reactRoot = reactRoots.get(container);
    if (reactRoot) {
      reactRoot.unmount();
      reactRoots.delete(container);
    }
  } else {
    // Legacy behavior: clear all (should be avoided in multi-view scenario)
  }
} 