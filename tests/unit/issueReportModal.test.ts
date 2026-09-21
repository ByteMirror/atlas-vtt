import { describe, expect, it, vi } from 'vitest';
import { Setting, type App } from 'obsidian';
import { IssueReportModal, type IssueReportModalOptions } from '../../src/app/support/IssueReportModal';
import { supportSettingsSection } from '../../src/app/settings/supportSettingsSection';

function openModal(overrides: Partial<IssueReportModalOptions> = {}) {
  const options: IssueReportModalOptions = {
    preset: {},
    diagnostics: { pluginVersion: '0.2.0-beta.1', obsidianVersion: '1.13.1', electronVersion: '37.2.0', system: 'macOS arm64', language: 'en-US', theme: 'Default', plugins: [{ id: 'brat', name: 'BRAT', version: '1.1.0' }] },
    errors: [{ at: '12:00:00', message: '[Atlas] Fog failed' }],
    openExternal: vi.fn(),
    copyText: vi.fn(async () => {}),
    ...overrides,
  };
  const modal = new IssueReportModal({} as App, options);
  modal.onOpen();
  const el = modal.contentEl;
  const set = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    element.dispatchEvent(new Event('change'));
  };
  const button = (text: string) => [...el.querySelectorAll('button')].find(entry => entry.textContent === text)!;
  return { modal, el, options, set, button };
}

describe('issue report modal', () => {
  it('refuses to open GitHub without a title and description', () => {
    const { button, options } = openModal();
    button('Open GitHub issue').click();
    expect(options.openExternal).not.toHaveBeenCalled();
  });
  it('opens a pre-filled bug report with the chosen options and environment', () => {
    const { el, set, button, options } = openModal();
    const [type, area] = el.querySelectorAll('select');
    set(type!, 'compatibility');
    set(area!, 'tokens');
    set(el.querySelector('input')!, 'Tokens vanish with Dataview');
    const [description, steps] = el.querySelectorAll('textarea');
    set(description!, 'After enabling Dataview the tokens disappear.');
    set(steps!, '1. Enable Dataview');
    expect(el.querySelector('pre')!.textContent).toContain('Obsidian: 1.13.1 (Electron 37.2.0)');
    button('Open GitHub issue').click();
    const url = new URL(vi.mocked(options.openExternal).mock.calls[0]![0]);
    expect(url.searchParams.get('type')).toBe('Conflict with another plugin or theme');
    expect(url.searchParams.get('area')).toBe('Tokens and creatures');
    expect(url.searchParams.get('title')).toBe('Tokens vanish with Dataview');
    expect(url.searchParams.get('steps')).toBe('1. Enable Dataview');
    expect(url.searchParams.get('environment')).toContain('BRAT 1.1.0');
    expect(url.searchParams.get('errors')).toBe('12:00:00 [Atlas] Fog failed');
  });
  it('switches wording for feature requests and copies a markdown report', async () => {
    const { modal, el, set, button, options } = openModal({ preset: { type: 'feature', area: 'dice' } });
    expect(modal.titleEl.textContent).toBe('Suggest a feature');
    expect(el.textContent).toContain('What would you like to do?');
    set(el.querySelector('select')!, 'bug');
    expect(modal.titleEl.textContent).toBe('Report an issue');
    expect(el.textContent).toContain('Steps to reproduce');
    set(el.querySelector('select')!, 'feature');
    set(el.querySelector('input')!, 'Dice presets');
    set(el.querySelector('textarea')!, 'Save common rolls.');
    button('Copy report').click();
    await Promise.resolve();
    const text = vi.mocked(options.copyText).mock.calls[0]![0];
    expect(text).toContain('# Dice presets');
    expect(text).toContain('Feature request · Dice');
    expect(text).not.toContain('Recent errors');
  });
  it('is reachable from the settings tab', () => {
    const reporter = { open: vi.fn() };
    const section = supportSettingsSection(reporter as never);
    const container = document.createElement('div');
    for (const row of section.rows) row.render(new Setting(container));
    for (const button of container.querySelectorAll('button')) button.click();
    expect(reporter.open).toHaveBeenCalledWith({ type: 'bug' });
    expect(reporter.open).toHaveBeenCalledWith({ type: 'feature' });
  });
});
