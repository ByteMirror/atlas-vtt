import { describe, expect, it } from 'vitest';
import { contrastColorForGray } from '../../src/app/grid/gridContrastColor';
import { migrateMapFile } from '../../src/app/services/MapPersistence';

function flatImage(luminance: number): { width: number; height: number; data: Float32Array } {
  return { width: 4, height: 4, data: new Float32Array(16).fill(luminance) };
}

describe('contrastColorForGray', () => {
  it('draws black lines on a bright map', () => {
    expect(contrastColorForGray(flatImage(220))).toBe(0x000000);
  });

  it('draws white lines on a dark map', () => {
    expect(contrastColorForGray(flatImage(40))).toBe(0xffffff);
  });
});

describe('migrateMapFile grid colour', () => {
  const persisted = (color?: string): unknown => ({
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, ...(color ? { color } : {}) },
  });

  it('turns the old cyan default into automatic', () => {
    expect(migrateMapFile(persisted('#00FFFF')).grid?.color).toBeUndefined();
  });

  it('keeps a chosen colour', () => {
    expect(migrateMapFile(persisted('#FF0000')).grid?.color).toBe('#FF0000');
  });
});
