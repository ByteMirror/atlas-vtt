import { describe, expect, it } from 'vitest';
import { parseValueInput } from '../tokenValueEditor';

describe('parseValueInput', () => {
  const cur = { current: 12, max: 30 };

  it('sets current from a plain number', () => {
    expect(parseValueInput('15', cur)).toEqual({ current: 15, max: 30 });
  });

  it('edits the maximum independently', () => {
    expect(parseValueInput('40', cur, 'max')).toEqual({ current: 12, max: 40 });
    expect(parseValueInput('5', cur, 'max')).toEqual({ current: 5, max: 5 });
    expect(parseValueInput('0', cur, 'max')).toBeNull();
    expect(parseValueInput('15/40', cur)).toBeNull();
  });

  it('applies signed deltas to current', () => {
    expect(parseValueInput('+5', cur)).toEqual({ current: 17, max: 30 });
    expect(parseValueInput('-3', cur)).toEqual({ current: 9, max: 30 });
  });

  it('clamps current to 0..max', () => {
    expect(parseValueInput('-99', cur)).toEqual({ current: 0, max: 30 });
    expect(parseValueInput('99', cur)).toEqual({ current: 30, max: 30 });
    expect(parseValueInput('-99', cur, 'max')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(parseValueInput('abc', cur)).toBeNull();
    expect(parseValueInput('', cur)).toBeNull();
    expect(parseValueInput('5/0', cur)).toBeNull();
  });
});
