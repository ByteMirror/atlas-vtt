import React from 'react';
import { Circle, CircleOff } from 'lucide-react';
import { Button } from '../../primitives/button';

export function TokenRingToggle({ value, onChange, label, disabled = false }: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  return <Button variant={value ? 'secondary' : 'outline'} size="sm" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={() => onChange(!value)}>
    {value ? <Circle /> : <CircleOff />}<span>Atlas ring {value ? 'on' : 'off'}</span>
  </Button>;
}
