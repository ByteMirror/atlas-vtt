import { describe, it, expect } from 'vitest';
import { evaluateFormula, isFormulaError } from '../app/services/formulaEvaluator';

describe('evaluateFormula', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateFormula('2 + 3', {})).toBe(5);
    expect(evaluateFormula('10 - 4', {})).toBe(6);
    expect(evaluateFormula('3 * 4', {})).toBe(12);
    expect(evaluateFormula('10 / 4', {})).toBe(2.5);
  });

  it('respects operator precedence', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
  });

  it('resolves variable references', () => {
    expect(evaluateFormula('@{strength}', { strength: 18 })).toBe(18);
    expect(evaluateFormula('@{a} + @{b}', { a: 3, b: 4 })).toBe(7);
  });

  it('applies floor/ceil/min/max/abs functions', () => {
    expect(evaluateFormula('floor(2.9)', {})).toBe(2);
    expect(evaluateFormula('ceil(2.1)', {})).toBe(3);
    expect(evaluateFormula('min(3, 5)', {})).toBe(3);
    expect(evaluateFormula('max(3, 5)', {})).toBe(5);
    expect(evaluateFormula('abs(-4)', {})).toBe(4);
  });

  it('handles the D&D ability modifier formula', () => {
    expect(evaluateFormula('floor((@{strength} - 10) / 2)', { strength: 18 })).toBe(4);
    expect(evaluateFormula('floor((@{strength} - 10) / 2)', { strength: 10 })).toBe(0);
    expect(evaluateFormula('floor((@{strength} - 10) / 2)', { strength: 8 })).toBe(-1);
  });

  it('handles compound formulas', () => {
    expect(evaluateFormula('8 + @{proficiency} + @{int_mod}', { proficiency: 3, int_mod: 5 })).toBe(16);
  });

  it('returns error for unbound references', () => {
    const result = evaluateFormula('@{unknown}', {});
    expect(typeof result).toBe('object');
    expect((result as any).kind).toBe('unbound');
    expect((result as any).ref).toBe('unknown');
  });

  it('returns error for syntax errors', () => {
    const result = evaluateFormula('2 ++ 3', {});
    expect(typeof result).toBe('object');
    expect((result as any).kind).toBe('syntax');
  });

  it('returns an error for malformed decimal 1.2.3', () => {
    // After fix: '1.2' and '.3' tokenize as separate number tokens;
    // the parser rejects the extra token as a syntax error.
    const result = evaluateFormula('1.2.3', {});
    expect(typeof result).toBe('object');
    expect(isFormulaError(result as any)).toBe(true);
  });
});
