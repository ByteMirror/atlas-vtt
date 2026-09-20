import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as ObsidianApp } from 'obsidian';
import FantasyStatblock from '../react/components/FantasyStatblock';
import { toTokenVitals } from './statblockVitalsSync';
import './statblock-preview-window.scss';

/**
 * Floating CMD+hover preview window for token statblocks.
 */
export class StatblockPreviewWindow {
  public notePath: string;
  public element: HTMLElement | null = null;
  public originatingToken: any = null;
  public originatingPin?: any;
  private manager: any;
  private initialPos?: { x: number; y: number } | undefined;
  private reactRoot: Root | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private app: ObsidianApp, notePath: string, originatingToken: any, manager: any, initialPos?: { x: number; y: number }) {
    this.notePath = notePath;
    this.originatingToken = originatingToken;
    this.originatingPin = originatingToken;
    this.manager = manager;
    this.initialPos = initialPos;

    this.element = document.body.createDiv({ cls: 'atlas-statblock-preview-window' });
    this.element.setAttribute('tabindex', '-1');

    if (initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }

    // The pin carries the hovered token's vitals; the statblock mirrors them.
    const vitals = originatingToken ? [toTokenVitals(originatingToken)] : [];
    this.reactRoot = createRoot(this.element);
    this.reactRoot.render(
      React.createElement(FantasyStatblock, {
        notePath,
        app: this.app,
        tokens: vitals,
      }),
    );

    // The statblock mounts after this constructor returns, so the window only
    // reaches its final size later. Re-clamp on every size change, otherwise
    // the first measurement is of an empty box and the window can end up
    // hanging off the edge of the screen.
    this.resizeObserver = new ResizeObserver(() => this.reposition());
    this.resizeObserver.observe(this.element);
  }

  private reposition(): void {
    if (this.initialPos) {
      this.setPosition(this.initialPos.x, this.initialPos.y);
    }
  }

  setPosition(x: number, y: number) {
    if (!this.element) return;

    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const padding = 20;

    this.element.classList.add('atlas-statblock-preview-window--measuring');

    window.requestAnimationFrame(() => {
      if (!this.element) return;

      const rect = this.element.getBoundingClientRect();
      const elementWidth = rect.width || 400;
      const elementHeight = rect.height || 600;

      // Only clip-and-scroll when the statblock genuinely cannot fit, so the
      // card's drop shadow stays intact in the common case.
      this.element.style.overflowY =
        this.element.scrollHeight > winHeight - padding * 2 ? 'auto' : 'visible';

      let finalX = x + 15;
      let finalY = y + 15;

      if (finalX + elementWidth > winWidth - padding) {
        finalX = x - elementWidth - 15;
        if (finalX < padding) {
          finalX = winWidth - elementWidth - padding;
        }
      }

      if (finalY + elementHeight > winHeight - padding) {
        finalY = y - elementHeight - 15;
        if (finalY < padding) {
          finalY = winHeight - elementHeight - padding;
        }
      }

      finalX = Math.max(padding, finalX);
      finalY = Math.max(padding, finalY);

      this.element.style.left = `${finalX}px`;
      this.element.style.top = `${finalY}px`;
      this.element.classList.remove('atlas-statblock-preview-window--measuring');
    });
  }

  hide(_force?: boolean): void {
    if (this.element) {
      this.element.classList.add('atlas-statblock-preview-window--closing');
      window.setTimeout(() => {
        this.destroy();
      }, 150);
    } else {
      this.destroy();
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    // Unmount asynchronously: React forbids unmounting while it is rendering,
    // which happens when destroy() runs from inside an effect.
    const root = this.reactRoot;
    this.reactRoot = null;
    if (root) window.setTimeout(() => root.unmount(), 0);

    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    if (this.manager && this.manager.handleStatblockPreviewClosed) {
      this.manager.handleStatblockPreviewClosed(this.notePath, this.originatingToken);
    }
  }

  getIsPinned(): boolean {
    return false;
  }
}
