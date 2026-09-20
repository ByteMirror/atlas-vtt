import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    app: null,
    view: null,
  }),
}));

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (state: any) => unknown) => selector({
    objects: { tokens: {} },
    tokenSettings: { showInstanceBadges: true },
  }),
}));

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({
  zoomToTokenWithHighlight: vi.fn(),
}));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';

function createEntry(): InitiativeEntry {
  return {
    id: 'entry-1',
    tokenId: 'token-1',
    name: 'Bandit Captain',
    initiative: 12,
    initiativeModifier: 2,
    hp: { current: 8, max: 10 },
    isDefeated: false,
    isActive: false,
    isNPC: true,
    order: 0,
    statblockPath: 'atlas-vtt/statblocks/Bandit Captain.md',
  };
}

describe('InitiativeCard statblock preview hover behavior', () => {
  it('does not repeatedly trigger onHover when this card is already active preview target', () => {
    const onHover = vi.fn();
    const entry = createEntry();

    const { rerender, getByRole } = render(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');

    fireEvent.mouseMove(card, { metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);

    rerender(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={true}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    fireEvent.mouseMove(card, { metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('opens the preview when the modifier key is pressed after the card is already hovered', () => {
    const onHover = vi.fn();
    const entry = createEntry();

    const { getByRole } = render(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');

    fireEvent.mouseEnter(card);
    expect(onHover).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('keeps working when the modifier key is tracked globally but not reflected on the mouse event', () => {
    const onHover = vi.fn();
    const entry = createEntry();

    const { getByRole } = render(
      <InitiativeCard
        entry={entry}
        index={0}
        isHoveredForPreview={false}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnd={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={onHover}
      />,
    );

    const card = getByRole('listitem');

    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    fireEvent.mouseMove(card);

    expect(onHover).toHaveBeenCalledTimes(1);
  });
});
