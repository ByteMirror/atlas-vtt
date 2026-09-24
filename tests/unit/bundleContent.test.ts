import { describe, expect, it } from 'vitest';
import { rewriteContent } from '../../src/app/services/collectionBundle/bundleContent';
import type { BundleFile } from '../../src/app/services/collectionBundle/bundleFormat';

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const decode = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer);

describe('statblock notes', () => {
  const note: BundleFile = { vaultPath: 'B/g.md', role: 'statblock-note', statblockImage: { key: 'image', path: 'B/g.png' } };

  it('rewrites the artwork field it names, not an earlier line with the same value', () => {
    const raw = '---\ntoken-image: B/g.png\nimage: B/g.png\n---\nA goblin.';
    const rewritten = decode(rewriteContent(note, encode(raw), new Map([['B/g.png', "atlas-vtt/x/Gold$'s.png"]])));
    expect(rewritten).toBe('---\ntoken-image: B/g.png\nimage: "atlas-vtt/x/Gold$\'s.png"\n---\nA goblin.');
  });

  it('leaves notes whose artwork did not move, or that have no such field, byte for byte', () => {
    const raw = encode('---\nimage: B/g.png\n---\n');
    expect(rewriteContent(note, raw, new Map([['other', 'x']]))).toBe(raw);
    const plain = encode('No frontmatter here.');
    expect(rewriteContent(note, plain, new Map([['B/g.png', 'x']]))).toBe(plain);
  });
});

describe('JSON files', () => {
  const scene: BundleFile = { vaultPath: 'atlas-vtt/s.json', role: 'asset-file' };

  it('keeps the file\'s indentation and trailing newline when paths move', () => {
    const raw = `${JSON.stringify({ mapPath: 'a/b.atlasmap', n: 1 }, null, 2)}\n`;
    expect(decode(rewriteContent(scene, encode(raw), new Map([['a/b.atlasmap', 'c/b.atlasmap']]))))
      .toBe(`${JSON.stringify({ mapPath: 'c/b.atlasmap', n: 1 }, null, 2)}\n`);
  });

  it('returns the original bytes when no path in it moves', () => {
    const raw = encode('{"mapPath":"a/b.atlasmap"}');
    expect(rewriteContent(scene, raw, new Map([['elsewhere', 'x']]))).toBe(raw);
  });
});
