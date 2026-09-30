import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VisionTab } from '../../src/app/react/components/collection-settings/VisionTab';
import { DEFAULT_GRID_DEFAULTS } from '../../src/app/gameSystems/systemRules';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../../src/app/types/lightingTypes';

function Harness({ initial, grid = DEFAULT_GRID_DEFAULTS }: { initial?: TokenVisionDefaults; grid?: CollectionGridDefaults }): React.ReactElement {
  const [vision, setVision] = useState<TokenVisionDefaults | undefined>(initial);
  return (
    <>
      <VisionTab gridDefaults={grid} vision={vision} onChange={setVision} />
      <output data-testid="vision">{JSON.stringify(vision ?? null)}</output>
    </>
  );
}

const saved = (): unknown => JSON.parse(screen.getByTestId('vision').textContent ?? 'null');
const field = (name: RegExp): HTMLInputElement => screen.getByLabelText(name) as HTMLInputElement;

afterEach(cleanup);

describe('VisionTab', () => {
  it('shows the four fields blank with the explanation and the collection’s unit', () => {
    render(<Harness grid={{ ...DEFAULT_GRID_DEFAULTS, unitType: 'meters' }} />);
    expect(screen.getByText('New tokens start with these values; vision itself stays off until you switch it on for a token.')).toBeTruthy();
    for (const name of [/^Sight range \(m\)/, /^Darkvision \(m\)/, /^Tremorsense \(m\)/, /^Vision angle/]) {
      expect(field(name).value).toBe('');
    }
    expect(field(/^Sight range/).placeholder).toBe('Unlimited');
    expect(saved()).toBeNull();
  });

  it('shows the values of the collection', () => {
    render(<Harness initial={{ range: 60, darkvision: 30, tremorsense: 10, angle: 90 }} />);
    expect([/^Sight range/, /^Darkvision/, /^Tremorsense/, /^Vision angle/].map((name) => field(name).value)).toEqual(['60', '30', '10', '90']);
  });

  it('edits one field at a time and leaves the others unset', () => {
    render(<Harness />);
    fireEvent.change(field(/^Darkvision/), { target: { value: '60' } });
    expect(saved()).toEqual({ darkvision: 60 });
    fireEvent.change(field(/^Vision angle/), { target: { value: '120' } });
    expect(saved()).toEqual({ darkvision: 60, angle: 120 });
  });

  it('clears a field when it is blanked, and everything when all are blank', () => {
    render(<Harness initial={{ range: 30, darkvision: 60 }} />);
    fireEvent.change(field(/^Sight range/), { target: { value: '' } });
    expect(saved()).toEqual({ darkvision: 60 });
    fireEvent.change(field(/^Darkvision/), { target: { value: '' } });
    expect(saved()).toBeNull();
  });

  it('treats a full turn or an invalid number as nothing', () => {
    render(<Harness />);
    fireEvent.change(field(/^Vision angle/), { target: { value: '360' } });
    expect(saved()).toBeNull();
    fireEvent.change(field(/^Sight range/), { target: { value: '-4' } });
    expect(saved()).toBeNull();
  });
});
