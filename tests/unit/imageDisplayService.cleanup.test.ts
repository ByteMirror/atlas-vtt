import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
}));

import { ImageDisplayService } from '../../src/app/services/ImageDisplayService';

describe('ImageDisplayService cleanup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      });
    }
  });

  test('removes player window document listeners when closing the image display', () => {
    const app = { workspace: {} } as any;
    const service = new ImageDisplayService(app);
    const playerDoc = document.implementation.createHTMLDocument('player');
    const playerWindow = { document: playerDoc } as Window;
    const removeSpy = vi.spyOn(playerDoc, 'removeEventListener');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    (service as any).createImageDisplay(playerWindow, 'blob:test-image', 'test.png');
    service.closeImageDisplay();

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-image');

    revokeSpy.mockRestore();
  });

  test('unregisters workspace menu hooks on destroy', () => {
    const fileMenuRef = { id: 'file-menu' };
    const linkMenuRef = { id: 'link-menu' };
    const editorMenuRef = { id: 'editor-menu' };
    const on = vi
      .fn()
      .mockReturnValueOnce(fileMenuRef)
      .mockReturnValueOnce(linkMenuRef)
      .mockReturnValueOnce(editorMenuRef);
    const offref = vi.fn();
    const app = {
      workspace: { on, offref },
      metadataCache: {},
      vault: {},
    } as any;

    const service = new ImageDisplayService(app);
    service.registerContextMenu();
    service.destroy();

    expect(offref).toHaveBeenCalledWith(fileMenuRef);
    expect(offref).toHaveBeenCalledWith(linkMenuRef);
    expect(offref).toHaveBeenCalledWith(editorMenuRef);
  });
});
