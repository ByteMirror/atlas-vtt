import { describe, expect, it } from 'vitest';
import { cardMask, unmountedRegions, type CardLayout } from '../../src/app/packages/components/asset-manager/components/gridSkeleton';

// Eight columns of 150 px cards with an 8 px gap; rows of 190 px.
const GRID = { columns: 8, pitchX: 158, pitchY: 198, gap: 8 };
const LAYOUT: CardLayout = { art: { x: 8, y: 8, size: 134, radius: 8 }, name: { y: 150, height: 17, fontSize: 13 } };

const svgOf = (mask: string): string => decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));

describe('unmountedRegions', () => {
  it('covers the rows above and below the mounted ones', () => {
    const regions = unmountedRegions({ ...GRID, firstRow: 3, lastRow: 9, assetCount: 8 * 14 });
    expect(regions).toEqual([
      { top: 0, height: 3 * 198 - 8 },
      { top: 10 * 198, height: 4 * 198 - 8 },
    ]);
  });

  it('gives a last row that is not full a region as wide as its cards', () => {
    const regions = unmountedRegions({ ...GRID, firstRow: 0, lastRow: 4, assetCount: 8 * 6 + 3 });
    expect(regions).toEqual([
      { top: 5 * 198, height: 198 - 8 },
      { top: 6 * 198, height: 198 - 8, width: 3 * 158 - 8 },
    ]);
  });

  it('draws none over mounted rows, none past the last asset and none before a row is mounted', () => {
    expect(unmountedRegions({ ...GRID, firstRow: 0, lastRow: 6, assetCount: 8 * 6 + 3 })).toEqual([]);
    expect(unmountedRegions({ ...GRID, firstRow: 0, lastRow: 5, assetCount: 8 * 6 })).toEqual([]);
    expect(unmountedRegions({ ...GRID, firstRow: null, lastRow: null, assetCount: 80 })).toEqual([]);
  });

  it('reaches only so far from the mounted rows, however long the list', () => {
    const regions = unmountedRegions({ ...GRID, firstRow: 500, lastRow: 506, assetCount: 8 * 5000 });
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(region.height).toBeLessThan(2400 + 198);
    expect(regions[0]!.top + regions[0]!.height + 8).toBe(500 * 198);
    expect(regions[1]!.top).toBe(507 * 198);
  });
});

describe('cardMask', () => {
  it('draws a token as the circle of its art and a bar where its name is, in a tile of one cell', () => {
    const svg = svgOf(cardMask('tokens', LAYOUT, 150, 158, 198));
    expect(svg).toContain("width='158' height='198'");
    expect(svg).toContain("<circle cx='75' cy='75' r='67'/>");
    expect(svg).toMatch(/<rect x='37.5' y='15[0-9.]+' width='75'/);
  });

  it('draws a map as its picture and an encounter as its three portraits', () => {
    expect(svgOf(cardMask('maps', LAYOUT, 150, 158, 198))).toContain("<rect x='8' y='8' width='134' height='134' rx='8'/>");
    expect(svgOf(cardMask('encounters', LAYOUT, 150, 158, 198)).match(/<circle/g)).toHaveLength(3);
  });
});
