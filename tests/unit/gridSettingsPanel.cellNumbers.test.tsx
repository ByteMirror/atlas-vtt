import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { GridSettingsPanel } from '../../src/app/react/components/command-palette/GridSettingsPanel';
import type { GridState } from '../../src/app/services/MapPersistence';
import type { AtlasView } from '../../src/app/atlas-view';

afterEach(() => cleanup());

function fakeView(grid: GridState | null): AtlasView {
  const store = create<{ grid: GridState | null; setGrid: (grid: GridState) => void }>((set) => ({
    grid,
    setGrid: (next) => set({ grid: next }),
  }));
  return { atlasStore: store } as unknown as AtlasView;
}

const baseGrid: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

function renderPanel(view: AtlasView): void {
  render(
    <GridSettingsPanel
      view={view}
      localOpacity={0.7}
      setLocalOpacity={vi.fn()}
      localLineWidth={1}
      setLocalLineWidth={vi.fn()}
      localGridVisible
      setLocalGridVisible={vi.fn()}
      localSnapToGrid
      setLocalSnapToGrid={vi.fn()}
      debouncedOpacityUpdate={vi.fn()}
      debouncedLineWidthUpdate={vi.fn()}
    />,
  );
}

describe('GridSettingsPanel cell numbers', () => {
  it('shows the Cell numbers row on a square grid', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square' }));
    expect(screen.getByText('Cell numbers')).toBeTruthy();
  });

  it('hides the number-opacity row until a format is chosen', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square' }));
    expect(screen.queryByText('Number opacity')).toBeNull();
  });

  it('shows the number-opacity row once a format is chosen', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square', cellNumbers: 'column-row' }));
    expect(screen.getByText('Number opacity')).toBeTruthy();
  });
});
