import { act, cleanup, renderHook, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { useCollectionTransfer, type CollectionTransferActions } from '../../src/app/packages/components/asset-manager/hooks/useCollectionTransfer';
import { importCollectionBundle, type CollectionImportResult, type ImportOptions, type UpdateRequest } from '../../src/app/services/collectionBundle/collectionImport';
import { confirmAction } from '../../src/app/ui/confirmDialog';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/services/collectionBundle/collectionImport', () => ({ importCollectionBundle: vi.fn() }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn() }));

const request = { existing: { name: 'Default 2' }, imported: { name: '5e' }, exportedAt: Date.now() } as UpdateRequest;

/** Imports that meet a collection the vault already has, as the Dolmenwood vault did. */
function importsExistingCollection(): void {
  vi.mocked(importCollectionBundle).mockImplementation(async (_app, _assets, _file, options?: ImportOptions): Promise<CollectionImportResult> => {
    const update = await options!.confirmUpdate!(request);
    return { outcome: update ? 'updated' : 'kept', collectionName: '5e', assetCount: 3, fileCount: 9 };
  });
}

function setup(): { hook: RenderHookResult<CollectionTransferActions, unknown>; onImported: ReturnType<typeof vi.fn> } {
  const onImported = vi.fn(async (): Promise<void> => undefined);
  const app = { workspace: { trigger: vi.fn() } };
  const hook = renderHook(() => useCollectionTransfer({ app: app as never, assetService: {} as never, selectedCollection: null, onImported }));
  return { hook, onImported };
}

function pickFile(hook: RenderHookResult<CollectionTransferActions, unknown>): void {
  act(() => hook.result.current.handleImportCollection());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['zip'], '5e.atlas-collection.zip')] });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it('asks with a warning before updating, keeping the asset manager blocked, and changes nothing when declined', async () => {
  importsExistingCollection();
  let answer: (update: boolean) => void = () => undefined;
  vi.mocked(confirmAction).mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  const { hook, onImported } = setup();
  pickFile(hook);
  await vi.waitFor(() => expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Update collection', confirmLabel: 'Update', destructive: true })));
  expect(hook.result.current.transfer).toMatchObject({ isAwaitingConfirmation: true });
  await act(async () => answer(false));
  expect(hook.result.current.transfer).toBeNull();
  expect(onImported).not.toHaveBeenCalled();
});

it('shows the result of a confirmed update until it is closed', async () => {
  importsExistingCollection();
  vi.mocked(confirmAction).mockResolvedValue(true);
  const { hook, onImported } = setup();
  pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer?.title).toBe('Collection imported'));
  expect(hook.result.current.transfer?.progress.message).toBe('Updated "5e" with 3 assets from the export.');
  await vi.waitFor(() => expect(onImported).toHaveBeenCalled());
  act(() => hook.result.current.transfer?.prompt?.actions[0]?.onSelect());
  expect(hook.result.current.transfer).toBeNull();
});

it('reports the result as a notice when the asset manager closed during the import', async () => {
  let finishImport: (result: CollectionImportResult) => void = () => undefined;
  vi.mocked(importCollectionBundle).mockImplementation(() => new Promise((resolve) => { finishImport = resolve; }));
  const { hook } = setup();
  pickFile(hook);
  await vi.waitFor(() => expect(importCollectionBundle).toHaveBeenCalled());
  hook.unmount();
  await act(async () => finishImport({ outcome: 'created', collectionName: '5e', assetCount: 3, fileCount: 9 }));
  expect(Notice).toHaveBeenCalledWith('Imported "5e" with 3 assets.');
});
