import React, { useId } from 'react';

interface Props {
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** Extra explanation for assistive technology; not shown as a tooltip. */
  hint?: string;
  onChange: (checked: boolean) => void;
}

/** Obsidian's native switch markup so the modal matches the toggles in Atlas settings. */
export function PreferenceToggle({ label, checked, disabled = false, hint, onChange }: Props): React.JSX.Element {
  const hintId = useId();
  const switchClass = ['checkbox-container', checked && 'is-enabled', disabled && 'is-disabled'].filter(Boolean).join(' ');
  // The hint lives outside the label so it describes the switch without joining its accessible name.
  return <>
    <label className="atlas-changelog-preference">
      <span className={switchClass}>
        <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={hint ? hintId : undefined}
          onChange={event => onChange(event.target.checked)} />
      </span>
      <span>{label}</span>
    </label>
    {hint && <span id={hintId} className="atlas-changelog-visually-hidden">{hint}</span>}
  </>;
}
