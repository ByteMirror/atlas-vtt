import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const openContextMenuGlobalMock = vi.fn();

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (...args: any[]) => openContextMenuGlobalMock(...args),
}));

import { ObsidianMenuDropdown } from '../../src/app/packages/components/shared/ObsidianMenuDropdown';

describe('ObsidianMenuDropdown empty option labels', () => {
  beforeEach(() => {
    openContextMenuGlobalMock.mockReset();
  });

  it('renders an explicit label for empty string options in array mode', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <ObsidianMenuDropdown
        value=""
        options={['', 'One', 'Two']}
        onChange={onChange}
        placeholder="Type"
      />,
    );

    fireEvent.click(getByText('Type'));

    const entries = openContextMenuGlobalMock.mock.calls[0]?.[0] as Array<{ label: string; onClick: () => void; checked?: boolean }>;
    expect(entries[0]?.label).toBe('None');
    expect(entries[0]?.checked).toBe(true);

    act(() => {
      entries[0]?.onClick();
    });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders an explicit label for empty display values in object mode', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ObsidianMenuDropdown
        value=""
        options={{ '': '', first: 'First' }}
        onChange={onChange}
        placeholder="Category"
      />,
    );

    const trigger = container.querySelector('.text-icon-button') as HTMLElement;
    fireEvent.click(trigger);

    const entries = openContextMenuGlobalMock.mock.calls[0]?.[0] as Array<{ label: string }>;
    expect(entries[0]?.label).toBe('None');
  });
});
