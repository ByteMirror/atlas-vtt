import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { createPinNoteSearch } from '../../src/app/tools/pinNoteSearch';

let container: HTMLElement;

function setup(headings: Record<string, string[]> = {}): { onPick: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const files = ['Tavern.md', 'Temple.md', 'Town.atlasmap'].map((path) => new TFile(path));
  const app = {
    vault: { getAllLoadedFiles: () => files },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        headings: (headings[file.basename] ?? []).map((heading) => ({ heading, level: 2 })),
      }),
    },
  } as unknown as App;
  const onPick = vi.fn();
  const onCancel = vi.fn();
  container = document.body.createDiv();
  createPinNoteSearch(container, { app, onPick, onCancel });
  return { onPick, onCancel };
}

const input = (): HTMLInputElement => container.querySelector<HTMLInputElement>('.pin-search-input')!;
const activeName = (): string | null | undefined =>
  container.querySelector('.pin-result-item.is-active .pin-result-name')?.textContent;
const press = (key: string): void => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};
const type = (value: string): void => {
  input().value = value;
  input().dispatchEvent(new Event('input'));
};

describe('pin note search', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => container.remove());

  it('activates the first result before anything is typed', () => {
    const { onPick } = setup();
    expect(activeName()).toBe('Tavern');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md');
  });

  it('moves the active result with the arrow keys, wrapping at both ends', () => {
    const { onPick } = setup();
    press('ArrowDown');
    expect(activeName()).toBe('Temple');
    press('ArrowUp');
    press('ArrowUp');
    expect(activeName()).toBe('Town');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Town.atlasmap');
  });

  it('activates the first match again after every change to the search', () => {
    setup();
    press('ArrowDown');
    type('t');
    expect(activeName()).toBe('Tavern');
    type('tem');
    expect(activeName()).toBe('Temple');
  });

  it('opens the headings of a note that has them and activates the whole note first', () => {
    const { onPick } = setup({ Tavern: ['Cellar', 'Rooms'] });
    press('Enter');
    expect(input().value).toBe('Tavern#');
    expect(activeName()).toBe('Entire note');
    press('ArrowDown');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md#Cellar');
  });

  it('activates the first matching heading', () => {
    const { onPick } = setup({ Tavern: ['Cellar', 'Rooms'] });
    type('Tavern#ro');
    expect(activeName()).toBe('Rooms');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md#Rooms');
  });

  it('follows the pointer, so Enter picks the hovered result', () => {
    const { onPick } = setup();
    container.querySelectorAll<HTMLElement>('.pin-result-item')[2]!.dispatchEvent(new MouseEvent('mousemove'));
    expect(activeName()).toBe('Town');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Town.atlasmap');
  });

  it('cancels on Escape and does nothing on Enter without results', () => {
    const { onPick, onCancel } = setup();
    type('dragon');
    press('Enter');
    expect(onPick).not.toHaveBeenCalled();
    press('Escape');
    expect(onCancel).toHaveBeenCalled();
  });
});
