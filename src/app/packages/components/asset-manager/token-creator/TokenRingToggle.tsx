import React from 'react';
import { Circle, CircleOff, Minus } from 'lucide-react';
import { Button } from '../../primitives/button';

export function TokenRingToggle({ value, onChange, label, disabled = false, mixed = false }: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  mixed?: boolean;
}): React.JSX.Element {
  return <Button variant={value ? 'secondary' : 'outline'} size="sm" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={() => onChange(!value)}>
    {mixed ? <Minus /> : value ? <Circle /> : <CircleOff />}<span>{mixed ? 'Atlas rings mixed' : `Atlas ring ${value ? 'on' : 'off'}`}</span>
  </Button>;
}
