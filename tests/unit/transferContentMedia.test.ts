import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundleMedia } from '../../src/app/packages/components/asset-manager/collection-transfer/contentMedia';
import { statblockSourceFromText } from '../../src/app/services/statblockNoteSource';

afterEach(() => { vi.unstubAllGlobals(); });

describe('bundle media', () => {
  it('unpacks each image once, answers from memory afterwards and releases every URL on dispose', async () => {
    let next = 0;
    const createObjectURL = vi.fn(() => `blob:${++next}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const blob = vi.fn(async (path: string) => (path === 'missing.webp' ? null : new Blob([path])));
    const media = bundleMedia({} as App, { blob, text: vi.fn(async () => 'note') });

    const first = media.imageUrl('goblin.webp');
    expect(first).toBeInstanceOf(Promise);
    expect(await first).toBe('blob:1');
    expect(media.imageUrl('goblin.webp')).toBe('blob:1');
    expect(await media.imageUrl('missing.webp')).toBeNull();
    expect(blob).toHaveBeenCalledTimes(2);
    expect(await media.noteText('Bestiary/Goblin.md')).toBe('note');

    media.dispose();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});

describe('statblocks from note text', () => {
  it('reads a frontmatter statblock, a statblock fence, or nothing', () => {
    expect(statblockSourceFromText('---\nstatblock: true\nname: Goblin\nhp: 7\n---\nA goblin.')).toEqual({
      kind: 'frontmatter', frontmatter: { statblock: true, name: 'Goblin', hp: 7 },
    });
    expect(statblockSourceFromText('---\ntags: [lore]\n---\n```statblock\ncreature: Goblin\n```')).toEqual({ kind: 'codeblock', params: { creature: 'Goblin' } });
    expect(statblockSourceFromText('# Just a note')).toBeNull();
  });
});
