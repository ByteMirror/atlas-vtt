import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validateResult, reviewBody, failureReason } = require('../../scripts/pr-review.js');

const changed = { 'src/a.ts': 40 };
const finding = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  severity: 'warning', path: 'src/a.ts', line: 10, problem: 'p', scenario: 's', fix: 'f', ...overrides,
});
const result = (verdict: string, findings: unknown[]): Record<string, unknown> => ({ verdict, checked: 'everything', findings });

describe('pr review verdicts', () => {
  it('accepts a pass without findings and a block with a blocker', () => {
    expect(validateResult(result('PASS', []), changed).verdict).toBe('PASS');
    expect(validateResult(result('BLOCKED', [finding({ severity: 'blocker' })]), changed).verdict).toBe('BLOCKED');
  });

  it('rejects a verdict that contradicts its findings', () => {
    expect(() => validateResult(result('PASS', [finding({ severity: 'blocker' })]), changed)).toThrow('contradicts');
    expect(() => validateResult(result('BLOCKED', [finding()]), changed)).toThrow('contradicts');
  });

  it('rejects findings outside the changed lines', () => {
    expect(() => validateResult(result('PASS', [finding({ path: 'src/other.ts' })]), changed)).toThrow('changed file');
    expect(() => validateResult(result('PASS', [finding({ line: 41 })]), changed)).toThrow('changed file');
    expect(() => validateResult(result('PASS', [finding({ path: 'constructor' })]), changed)).toThrow('changed file');
  });

  it('rejects extra fields, missing evidence and too many suggestions', () => {
    expect(() => validateResult({ ...result('PASS', []), approve: true }, changed)).toThrow('unexpected');
    expect(() => validateResult(result('PASS', [finding({ fix: '' })]), changed)).toThrow('evidence');
    const suggestions = [1, 2, 3].map((line) => finding({ severity: 'suggestion', line }));
    expect(() => validateResult(result('PASS', suggestions), changed)).toThrow('suggestions');
  });

  it('stamps the reviewed revision and the verdict into the body', () => {
    const body: string = reviewBody('h'.repeat(40), 'b'.repeat(40), result('PASS', [finding()]));
    expect(body.startsWith(`Reviewed head: ${'h'.repeat(40)}\nReviewed base: ${'b'.repeat(40)}\n`)).toBe(true);
    expect(body).toContain('`src/a.ts:10` — 🟡 p');
    expect(body.endsWith('<!-- atlas-verdict:PASS -->')).toBe(true);
  });

  it('explains a failure by its end reason and an API refusal only', () => {
    expect(failureReason({ terminal_reason: 'api_error', api_error_status: 401, result: 'Failed to authenticate.' }))
      .toBe('ended: api_error; API status 401: Failed to authenticate.');
    expect(failureReason({ terminal_reason: 'max_turns', result: 'source text' })).toBe('ended: max_turns');
  });
});
