import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openContextMenuGlobalMock = vi.fn();
const closeContextMenuGlobalMock = vi.fn();

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (...args: any[]) => openContextMenuGlobalMock(...args),
  closeContextMenuGlobal: (...args: any[]) => closeContextMenuGlobalMock(...args),
}));

import { ObsidianMenuDropdown } from '../../src/app/react/components/ObsidianMenuDropdown';

describe('React ObsidianMenuDropdown empty option labels', () => {
  beforeEach(() => {
    openContextMenuGlobalMock.mockReset();
    closeContextMenuGlobalMock.mockReset();
  });

  it('shows an explicit menu label for empty options', () => {
    const { container } = render(
      <ObsidianMenuDropdown
        value=""
        options={{ '': '', one: 'One' }}
        onChange={() => {}}
      />,
    );

    const button = container.querySelector('.text-icon-button') as HTMLElement;
    fireEvent.click(button);

    const entries = openContextMenuGlobalMock.mock.calls[0]?.[0] as Array<{ label: string }>;
    expect(entries[0]?.label).toBe('None');
  });
});
