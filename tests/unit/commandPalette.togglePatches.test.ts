import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const commandPalettePath = path.resolve(
  __dirname,
  '../../src/app/react/components/CommandPalette.tsx'
);

describe('CommandPalette toggle wiring', () => {
  const source = readFileSync(commandPalettePath, 'utf8');

  it('does not use legacy toggle wrapper class', () => {
    expect(source).not.toContain('className="toggle"');
  });

  it('does not use negated toggle visual patches', () => {
    expect(source).not.toMatch(/!\s*[\w?.()]+\s*\?\s*"atlas-toggle__switch atlas-toggle__switch--on"/g);
    expect(source).not.toMatch(/!\s*[\w?.()]+\s*\?\s*"atlas-toggle__thumb atlas-toggle__thumb--on"/g);
  });
});
