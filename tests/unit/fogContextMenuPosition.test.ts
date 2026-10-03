import { expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

it('opens the fog menu at the pointer in the window, not at its position on the canvas', () => {
  const harness = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => ({ isPlayerView: false, objects: { fog: {} } }) },
    viewport: { toWorld: (point: { x: number; y: number }) => point },
  });
  const event = {
    button: 2, clientX: 520, clientY: 310, global: { x: 220, y: 270 }, stopPropagation: vi.fn(),
  } as unknown as FederatedPointerEvent;

  harness.handleViewportFogPointerDown('fog-1', event);

  expect(openContextMenuGlobal).toHaveBeenCalledWith(expect.any(Array), { x: 520, y: 310 });
});
