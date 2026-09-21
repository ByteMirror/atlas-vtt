import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer } from 'obsidian';
import { ChangelogContent } from '../../src/app/changelog/ChangelogContent';

const releases = ['0.1.10', '0.1.9'].map(version => ({ version, title: `Release ${version}`, date: '2026-09-20', markdown: `## Fixed\n\n- Fix from ${version}.` }));
function props() {
  return { app: {} as any, releases, currentVersion: '0.1.10', newVersions: new Set(['0.1.10']), showOnUpdate: true,
    onPreferenceChange: vi.fn(), onCurrentRendered: vi.fn(), onClose: vi.fn() };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('release history accordion', () => {
  it('opens the current entry, renders older notes on demand, and permits multiple expanded entries', async () => {
    const options = props();
    render(<ChangelogContent {...options} />);
    await screen.findByText(/Fix from 0.1.10/);
    expect(screen.queryByText(/Fix from 0.1.9/)).toBeNull();
    const older = screen.getByRole('button', { name: /Release 0.1.9/ });
    expect(older.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(older);
    await screen.findByText(/Fix from 0.1.9/);
    expect(screen.getByRole('button', { name: /Release 0.1.10/ }).getAttribute('aria-expanded')).toBe('true');
    expect(older.getAttribute('aria-expanded')).toBe('true');
    expect(options.onCurrentRendered).toHaveBeenCalled();
  });
  it('offers a labeled opt-out and a close action', () => {
    const options = props(); render(<ChangelogContent {...options} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show changelog after updates' }));
    expect(options.onPreferenceChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(options.onClose).toHaveBeenCalledOnce();
  });
  it('does not acknowledge failed Markdown rendering and shows a readable fallback', async () => {
    vi.spyOn(MarkdownRenderer, 'render').mockRejectedValue(new Error('renderer failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = props(); render(<ChangelogContent {...options} />);
    await screen.findByRole('alert');
    expect(screen.getByText(/Fix from 0.1.10/)).toBeTruthy();
    expect(options.onCurrentRendered).not.toHaveBeenCalled();
  });
  it('ignores rendering that finishes after closing', async () => {
    let finish!: () => void;
    vi.spyOn(MarkdownRenderer, 'render').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const options = props(); const result = render(<ChangelogContent {...options} />);
    result.unmount();
    await act(async () => finish());
    expect(options.onCurrentRendered).not.toHaveBeenCalled();
  });
});
