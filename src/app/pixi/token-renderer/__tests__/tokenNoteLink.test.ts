import { describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { Character, Token } from '../../../types';
import { isLinkedNotePreview, linkedPreviewPath, tokenPreviewPath } from '../tokenNoteLink';
import { movedPathOf, rewriteMapReferences } from '../../../services/renamedPaths';
import { collectMapObjects } from '../../../clipboard/mapObjectContent';
import { TokenNoteSuggestModal } from '../TokenNoteSuggestModal';

const regular: Token = { kind: 'token', id: 'one', x: 1, y: 2, imagePath: 'art.png' };
const character: Character = { ...regular, kind: 'character', name: 'Hero', statblockPath: 'creature.md' };

describe('individual token note links', () => {
  it('offers existing Markdown files and returns the chosen path', () => {
    const note = { path: 'Notes/Journal.md' } as TFile;
    const select = vi.fn();
    const app = { vault: { getMarkdownFiles: () => [note] } } as unknown as App;
    const picker = new TokenNoteSuggestModal(app, select);
    expect(picker.getItems()).toEqual([note]);
    expect(picker.getItemText(note)).toBe('Notes/Journal.md');
    picker.onChooseItem(note);
    expect(select).toHaveBeenCalledWith('Notes/Journal.md');
  });

  it('links and unlinks without changing the statblock fallback', () => {
    expect(tokenPreviewPath(regular)).toBeUndefined();
    expect(tokenPreviewPath(character)).toBe('creature.md');
    const linked = { ...character, notePath: 'journal.md' };
    expect(tokenPreviewPath(linked)).toBe('creature.md');
    expect(tokenPreviewPath(linked, true)).toBe('journal.md');
    const { notePath: _removed, ...unlinked } = linked;
    expect(tokenPreviewPath(unlinked)).toBe('creature.md');
    expect(tokenPreviewPath(unlinked, true)).toBe('creature.md');
    expect(unlinked.statblockPath).toBe('creature.md');
  });

  it('switches the target immediately as Shift changes while Mod remains held', () => {
    const paths = [false, true, false].map((shift) => linkedPreviewPath('creature.md', 'journal.md', shift));
    expect(paths).toEqual(['creature.md', 'journal.md', 'creature.md']);
    expect(tokenPreviewPath({ ...regular, notePath: 'journal.md' })).toBe('journal.md');
    expect(tokenPreviewPath({ ...regular, notePath: 'journal.md' }, true)).toBe('journal.md');
  });

  it('distinguishes preview modes when both links name the same file', () => {
    expect(linkedPreviewPath('creature.md', 'creature.md', false)).toBe('creature.md');
    expect(isLinkedNotePreview('creature.md', 'creature.md', false)).toBe(false);
    expect(isLinkedNotePreview('creature.md', 'creature.md', true)).toBe(true);
  });

  it('keeps a link through JSON persistence and per-token copies', () => {
    const linked = { ...regular, notePath: 'journal.md' };
    const restored = JSON.parse(JSON.stringify(linked)) as Token;
    const content = collectMapObjects({ tokens: { one: restored }, pins: {}, texts: {}, drawings: {} }, ['one']);
    const duplicate = { ...content.tokens[0]!, id: 'two' };
    expect(duplicate.notePath).toBe('journal.md');
    expect(tokenPreviewPath(duplicate)).toBe('journal.md');
  });

  it('rewrites note links on moves alongside statblock links', () => {
    const map = { objects: { tokens: { one: { ...character, notePath: 'journal.md' } } } };
    expect(rewriteMapReferences(map, movedPathOf([
      { from: 'journal.md', to: 'Notes/journal.md' },
      { from: 'creature.md', to: 'Bestiary/creature.md' },
    ]))).toBe(true);
    expect(map.objects.tokens.one.notePath).toBe('Notes/journal.md');
    expect(map.objects.tokens.one.statblockPath).toBe('Bestiary/creature.md');
  });
});
