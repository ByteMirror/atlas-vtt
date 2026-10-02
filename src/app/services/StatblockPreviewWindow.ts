import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as ObsidianApp } from 'obsidian';
import FantasyStatblock from '../react/components/FantasyStatblock';
import { toTokenVitals } from './statblockVitalsSync';
import type { NotePreviewUIManager, TokenPreviewAnchor } from './NotePreviewUIManager';
import {
  STATBLOCK_DRAG_EXCLUDED,
  STATBLOCK_DRAG_HANDLE,
} from '../react/components/statblock/StatblockPin';
import './statblock-preview-window.scss';

/**
 * Floating CMD+hover preview window for token statblocks.
 */
export class StatblockPreviewWindow {
  public notePath: string;
  public element: HTMLElement | null = null;
  public originatingPin: TokenPreviewAnchor;
  private manager: NotePreviewUIManager;
  private initialPos?: { x: number; y: number } | undefined;
  private reactRoot: Root | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private closing = false;
  /** A pinned window stays while the modifier key is released and the pointer leaves. */
  private pinned = false;
  private vitals: ReturnType<typeof toTokenVitals>[] = [];
  private detachDrag: (() => void) | null = null;
  private detachDismiss: (() => void) | null = null;
  /**
   * Set once the reader unpins a window they had pinned. Such a window is being
   * dismissed, so it closes as soon as the pointer leaves it — the manager only
   * sweeps unpinned previews when the modifier key comes up or the window
   * loses focus, neither of which need ever happen again.
   */
  private unpinnedByUser = false;

  constructor(
    private app: ObsidianApp,
    notePath: string,
    originatingToken: TokenPreviewAnchor,
    manager: NotePreviewUIManager,
    initialPos?: { x: number; y: number },
  ) {
    this.notePath = notePath;
    this.originatingPin = originatingToken;
    this.manager = manager;
    this.initialPos = initialPos;

    this.element = document.body.createDiv({ cls: 'atlas-statblock-preview-window' });
    this.element.setAttribute('tabindex', '-1');

    if (initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }

    // The pin carries the hovered token's vitals; the statblock mirrors them.
    this.vitals = [toTokenVitals(originatingToken)];
    this.reactRoot = createRoot(this.element);
    this.render();
    this.detachDrag = this.enableDragging(this.element);
    this.detachDismiss = this.dismissOnLeaveAfterUnpin(this.element);

    // The statblock mounts after this constructor returns, so the window only
    // reaches its final size later. Re-clamp on every size change, otherwise
    // the first measurement is of an empty box and the window can end up
    // hanging off the edge of the screen.
    this.resizeObserver = new ResizeObserver(() => this.reposition());
    this.resizeObserver.observe(this.element);
  }

  private render(): void {
    this.reactRoot?.render(
      React.createElement(FantasyStatblock, {
        notePath: this.notePath,
        app: this.app,
        tokens: this.vitals,
        pin: { pinned: this.pinned, onToggle: () => this.setPinned(!this.pinned) },
      }),
    );
  }

  /** Closes a window the reader has unpinned, once the pointer leaves it. */
  private dismissOnLeaveAfterUnpin(element: HTMLElement): () => void {
    const onLeave = (): void => {
      if (!this.pinned && this.unpinnedByUser) this.hide();
    };
    element.addEventListener('pointerleave', onLeave);
    return () => element.removeEventListener('pointerleave', onLeave);
  }

  /**
   * Moves the window by its grip or its header. Dragging pins it: a window the
   * reader has placed should not vanish the moment the modifier key comes up.
   */
  private enableDragging(element: HTMLElement): () => void {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (event.button !== 0 || !(target instanceof Element)) return;
      if (target.closest(STATBLOCK_DRAG_EXCLUDED)) return;
      if (!target.closest(STATBLOCK_DRAG_HANDLE)) return;

      event.preventDefault();
      event.stopPropagation();
      if (!this.pinned) this.setPinned(true);
      // The window now rests where it is put, so it is no longer placed by the
      // token it came from.
      this.initialPos = undefined;

      const rect = element.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      element.classList.add('atlas-statblock-preview-window--dragging');

      const onMove = (move: PointerEvent): void => {
        const margin = 8;
        const maxX = Math.max(margin, window.innerWidth - element.offsetWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - element.offsetHeight - margin);
        element.style.left = `${Math.min(Math.max(move.clientX - offsetX, margin), maxX)}px`;
        element.style.top = `${Math.min(Math.max(move.clientY - offsetY, margin), maxY)}px`;
      };
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        element.classList.remove('atlas-statblock-preview-window--dragging');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    element.addEventListener('pointerdown', onPointerDown);
    return () => element.removeEventListener('pointerdown', onPointerDown);
  }

  /**
   * Pinning keeps the window open once the modifier key is released, so the
   * statblock can be read, scrolled and rolled from while play continues. The
   * manager asks `getIsPinned()` before dismissing any preview.
   */
  private setPinned(pinned: boolean): void {
    // Unpinning is how a pinned window is dismissed; pinning again takes that back.
    this.unpinnedByUser = !pinned;
    this.pinned = pinned;
    this.element?.classList.toggle('atlas-statblock-preview-window--pinned', pinned);
    this.render();
  }

  private reposition(): void {
    // A pinned window stays where the reader left it; re-clamping would drag it
    // back to the token every time the statblock resizes.
    if (this.initialPos && !this.pinned) {
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

      // Cap the window to the viewport first, so the measurement below is of
      // the clamped box; the card body scrolls when the statblock is taller.
      this.element.style.maxHeight = `${winHeight - padding * 2}px`;

      const rect = this.element.getBoundingClientRect();
      const elementWidth = rect.width || 400;
      const elementHeight = rect.height || 600;

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
    if (this.closing) return;
    this.closing = true;
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
    this.detachDrag?.();
    this.detachDrag = null;
    this.detachDismiss?.();
    this.detachDismiss = null;

    // Unmount asynchronously: React forbids unmounting while it is rendering,
    // which happens when destroy() runs from inside an effect.
    const root = this.reactRoot;
    this.reactRoot = null;
    if (root) window.setTimeout(() => root.unmount(), 0);

    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    this.manager.handlePreviewClosed(this);
  }

  getIsPinned(): boolean {
    return this.pinned;
  }
}
