import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';

vi.mock('../../src/app/services/FantasyStatblocksService', () => ({
  findCreatureForNotePath: (): object => ({}),
}));
vi.mock('../../src/app/react/components/FantasyStatblock', () => ({ default: (): null => null }));

const VIEW_ID = 'statblock-preview-test';
const NOTE_PATH = 'Bestiary/Goblin.md';
const FADE_MS = 150;

function hoverToken(eventBus: EventEmitter): void {
  eventBus.emit('pin-hover-preview', {
    pin: { id: 'token-1', notePath: NOTE_PATH, x: 0, y: 0, type: 'token', name: 'Goblin' },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: true, ctrlKey: false },
  });
}

function openWindows(): number {
  return document.querySelectorAll('.atlas-statblock-preview-window').length;
}

describe('NotePreviewUIManager statblock previews', () => {
  let manager: NotePreviewUIManager;
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
    Platform.isMacOS = true;
    const { app } = createInMemoryApp({ files: { [NOTE_PATH]: '# Goblin' } });
    Object.assign(app.workspace, { getLeavesOfType: () => [], on: () => ({}) });
    eventBus = new EventEmitter();
    manager = new NotePreviewUIManager(app, eventBus, createViewAtlasStore(app, VIEW_ID), VIEW_ID);
  });

  afterEach(() => {
    manager.destroy();
    vi.runOnlyPendingTimers();
    document.body.empty();
    Platform.isMacOS = false;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('still closes a preview reopened while the previous one for the token fades out', () => {
    hoverToken(eventBus);
    eventBus.emit('map-loaded');
    hoverToken(eventBus);

    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(0);
  });

  it('closes on Cmd release after being hidden twice while fading', () => {
    hoverToken(eventBus);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS / 2);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(FADE_MS / 2);

    hoverToken(eventBus);
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    vi.advanceTimersByTime(FADE_MS);
    expect(openWindows()).toBe(0);
  });

  it('switches between statblock and Markdown previews for the same note path', () => {
    eventBus.emit('pin-hover-preview', {
      pin: { id: 'token-1', notePath: NOTE_PATH, linkedNotePath: NOTE_PATH,
        statblockPath: NOTE_PATH, x: 0, y: 0, type: 'token', name: 'Goblin' },
      screenX: 100, screenY: 100,
      pixiEvent: { metaKey: true, ctrlKey: false, shiftKey: false },
    });
    expect(openWindows()).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', metaKey: true, shiftKey: true }));
    expect(openWindows()).toBe(0);
    expect(document.querySelectorAll('.atlas-note-preview-window')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', metaKey: true }));
    expect(openWindows()).toBe(1);
    expect(document.querySelectorAll('.atlas-note-preview-window')).toHaveLength(0);
  });
});
