import { describe, expect, it, vi } from 'vitest';
import { createIssueSubmitter } from '../../src/app/support/issueSubmission';

const report = { type: 'bug', area: 'tokens', title: 'Test', description: 'Tokens vanished', steps: '', environment: '', errors: '' } as const;
describe('direct issue submission', () => {
  it('posts the full report and request ID without credentials', async () => {
    const send = vi.fn(async () => ({ status: 201, json: { number: 42, url: 'https://github.com/ByteMirror/atlas-vtt/issues/42' } }));
    const submit = createIssueSubmitter('https://reports.example.test/atlas/reports', send);
    await expect(submit(report, 'request-id')).resolves.toEqual({ number: 42, url: 'https://github.com/ByteMirror/atlas-vtt/issues/42' });
    const request = send.mock.calls[0]![0];
    expect(JSON.parse(request.body)).toEqual({ requestId: 'request-id', report });
    expect(request.headers.Authorization).toBeUndefined();
  });
  it('rejects failed responses and invalid receipts', async () => {
    for (const response of [
      { status: 429, json: { error: 'Please try again later.' } },
      { status: 201, json: { number: 42, url: 'https://evil.example/42' } },
      { status: 201, json: { number: 42, url: 'https://github.com/ByteMirror/atlas-vtt/issues/43' } },
      { status: 200, json: {} },
    ]) {
      const submit = createIssueSubmitter('https://reports.example.test/atlas/reports', async () => response);
      await expect(submit(report, 'request-id')).rejects.toThrow();
    }
  });
});
