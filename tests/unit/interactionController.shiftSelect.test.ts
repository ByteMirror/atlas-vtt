import { describe, expect, it, vi } from 'vitest';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';

function makeController(selectedIds: string[]): { controller: InteractionController; setSelection: ReturnType<typeof vi.fn>; viewport: any } {
  const setSelection = vi.fn();
  const viewport = {
    on: vi.fn(),
    off: vi.fn(),
    toWorld: vi.fn(() => ({ x: 0, y: 0 })),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  } as any;
  const store = {
    getState: () => ({
      activeTool: 'select',
      selectedIds,
      setSelection,
      objects: { tokens: { a: { id: 'a' }, b: { id: 'b' } } },
    }),
  } as any;
  const controller = new InteractionController(viewport, store, {} as any, {} as any, {} as any, false);
  controller.setTokenSpriteProvider(() => null);
  return { controller, setSelection, viewport };
}

const shiftClick = { button: 0, shiftKey: true, global: { x: 0, y: 0 }, stopPropagation: vi.fn() } as any;
const plainClick = { ...shiftClick, shiftKey: false } as any;

describe('InteractionController shift-click selection', () => {
  it('adds an unselected token to the selection and prepares a group drag', () => {
    const { controller, setSelection, viewport } = makeController(['a']);
    controller.handleViewportTokenPointerDown('b', shiftClick);
    expect(setSelection).toHaveBeenCalledWith(['a', 'b']);
    expect(viewport.plugins.pause).toHaveBeenCalledWith('drag');
    expect(controller.isDraggingTokens()).toBe(true);
  });

  it('removes a selected token without starting a drag', () => {
    const { controller, setSelection, viewport } = makeController(['a', 'b']);
    controller.handleViewportTokenPointerDown('b', shiftClick);
    expect(setSelection).toHaveBeenCalledWith(['a']);
    expect(viewport.plugins.pause).not.toHaveBeenCalled();
    expect(controller.isDraggingTokens()).toBe(false);
  });

  it('plain click still replaces the selection', () => {
    const { controller, setSelection } = makeController(['a']);
    controller.handleViewportTokenPointerDown('b', plainClick);
    expect(setSelection).toHaveBeenCalledWith(['b']);
  });
});
