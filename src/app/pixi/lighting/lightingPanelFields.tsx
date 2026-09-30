import React, { useId } from 'react';
import { Slider } from '../../packages/components/primitives/slider';
import { Toggle } from '../../packages/components/primitives/Toggle';

/** Fields shared by the lighting panels (`.atlas-light-panel`): a light's settings and the scene's. */

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

/** A colour from the system picker, picked in sRGB. */
export function ColorField({ label, value, onChange }: ColorFieldProps): React.ReactElement {
  const id = useId();
  return (
    <label className="atlas-light-panel__field atlas-light-panel__field--color" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown beside the label, e.g. "25 %"; nothing is shown without it. */
  display?: string;
  onPointerDown?: (event: React.PointerEvent) => void;
  onChange: (value: number) => void;
  /** The drag ended or a key moved the value: where it came to rest. */
  onCommit?: (value: number) => void;
}

export function SliderField({ label, value, min, max, step, display, onPointerDown, onChange, onCommit }: SliderFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__slider">
      <div className="atlas-light-panel__slider-head">
        <span id={id}>{label}</span>
        {display !== undefined && <output aria-hidden="true">{display}</output>}
      </div>
      <Slider aria-labelledby={id} value={[value]} min={min} max={max} step={step}
        onValueChange={([next]) => onChange(next ?? value)} {...(onPointerDown && { onPointerDown })}
        {...(onCommit && { onValueCommit: ([next]: number[]) => onCommit(next ?? value) })} />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  /** What the switch does in each state, shown as its tooltip. */
  tooltipOn: string;
  tooltipOff: string;
  onChange: (value: boolean) => void;
}

export function ToggleField({ label, value, tooltipOn, tooltipOff, onChange }: ToggleFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__toggle">
      <span id={id}>{label}</span>
      <Toggle value={value} onChange={() => onChange(!value)} tooltipOn={tooltipOn} tooltipOff={tooltipOff} labelledBy={id} />
    </div>
  );
}
