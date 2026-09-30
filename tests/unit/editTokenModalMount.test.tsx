import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// Cancel unmounts the modal's root and removes its container.
afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
});

describe('openEditTokenModal', () => {
  it('opens with its vision switch through its own React root, outside every tooltip provider', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `edit-token-${Math.random()}`);
    const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, vision: { enabled: true } };
    act(() => openEditTokenModal(token, store, app));
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByText('Vision & light')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    expect(document.body.querySelector('.atlas-vtt-root')).toBeNull();
  });
});
