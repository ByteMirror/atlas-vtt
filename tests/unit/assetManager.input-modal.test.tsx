import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import InputModal from '../../src/app/packages/components/primitives/InputModal';
import { useAssetManagerEffects } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects';

type EffectDeps = Parameters<typeof useAssetManagerEffects>[0];

// Keep the real dialog and manager event listeners together, with the dialog
// outside the manager container just as it is in AssetManager's ModalLayer.
function Harness({ onClose, onConfirm }: { onClose: () => void; onConfirm: (value: string) => void }) {
  const [inputOpen, setInputOpen] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useAssetManagerEffects({
    isOpen: true, onClose, initialTab: undefined, modalRef, containerRef,
    setSearch: vi.fn(), setActiveTab: vi.fn(), setIsSidebarCollapsed: vi.fn(), setSelectedCollection: vi.fn(),
    data: {} as EffectDeps['data'],
    sel: {
      selectedAssetIds: [], setSelectedAssetIds: vi.fn(), setSelectedFolderIds: vi.fn(),
      setSelectedFolderId: vi.fn(), setSelectedTagIds: vi.fn(), setSpawnCounts: vi.fn(),
      navigationHistory: { clear: vi.fn(), push: vi.fn() },
    } as unknown as EffectDeps['sel'],
    crud: {
      isTokenCreatorOpen: false, isMapCreatorOpen: false, isCreateSceneModalOpen: false,
      isCreateFolderModalOpen: false, isMoveModalOpen: false, settingsModalCollectionId: null,
      inputModalState: { isOpen: inputOpen }, setEditingToken: vi.fn(),
    } as unknown as EffectDeps['crud'],
    tags: { isTagManagerOpen: false, isEditTagsModalOpen: false } as EffectDeps['tags'],
    statblock: { linkingStatblockAsset: null } as EffectDeps['statblock'],
  });
  return (
    <div className="workspace-leaf mod-active">
      <div ref={modalRef} tabIndex={-1}>
        <div ref={containerRef}>Asset manager</div>
      </div>
      <InputModal isOpen={inputOpen} onClose={() => setInputOpen(false)}
        title="Create New Collection" placeholder="Enter collection name" onConfirm={onConfirm} />
    </div>
  );
}

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(<Harness onClose={onClose} onConfirm={onConfirm} />);
  return { onClose, onConfirm };
}

function clickWithMouseDown(element: Element) {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

it('lets the collection input receive focus and clicks without dismissing the manager', async () => {
  const { onClose } = setup();
  const input = screen.getByRole('textbox');
  await waitFor(() => expect(document.activeElement).toBe(input));
  clickWithMouseDown(input);
  expect(onClose).not.toHaveBeenCalled();
});

it.each(['Cancel', 'Close'])('%s dismisses only the collection dialog', (name) => {
  const { onClose, onConfirm } = setup();
  clickWithMouseDown(screen.getByRole('button', { name }));
  expect(onClose).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('confirms the collection name without closing the manager', () => {
  const { onClose, onConfirm } = setup();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Encounters  ' } });
  clickWithMouseDown(screen.getByRole('button', { name: 'Confirm' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith('Encounters');
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('Escape closes the collection dialog first, then the manager on a second press', () => {
  const { onClose } = setup();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('backdrop clicks dismiss only the child dialog and outside clicks work afterward', () => {
  const { onClose } = setup();
  clickWithMouseDown(screen.getByRole('textbox').closest('.atlas-modal-overlay')!);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.mouseDown(document.body);
  expect(onClose).toHaveBeenCalledTimes(1);
});
