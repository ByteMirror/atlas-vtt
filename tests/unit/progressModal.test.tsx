import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressModal } from '../../src/app/packages/components/primitives/ProgressModal';

afterEach(cleanup);

it('shows progress while working and the result with a close button once done', () => {
  const { rerender } = render(<ProgressModal title="Importing collection" message="Writing 3 of 9 files…" fraction={0.3} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('30');
  expect(screen.queryByRole('button')).toBeNull();

  const onClose = vi.fn();
  rerender(<ProgressModal title="Importing collection" message={'"5e" is already up to date (v2).'} fraction={1} onClose={onClose} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('"5e" is already up to date (v2).');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(2);
});
