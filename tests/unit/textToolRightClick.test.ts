import { expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { TextTool } from '../../src/app/tools/TextTool';

const promptForText = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock('../../src/app/ui/textInputDialog', () => ({ promptForText }));

it('places text with the primary button only, so a right-drag that pans the map adds none', () => {
  const tool = Object.assign(Object.create(TextTool.prototype) as TextTool, {
    viewport: { toWorld: (point: { x: number; y: number }) => point },
  }) as unknown as { handleMapClick(event: FederatedPointerEvent): void };
  const tap = (button: number): FederatedPointerEvent =>
    ({ button, pointerId: 7, global: { x: 10, y: 10 } }) as unknown as FederatedPointerEvent;

  tool.handleMapClick(tap(2));
  expect(promptForText).not.toHaveBeenCalled();

  tool.handleMapClick(tap(0));
  expect(promptForText).toHaveBeenCalledOnce();
});
