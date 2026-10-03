import React, { FC, useId } from "react"
import { ToggleSwitch } from "./Toggle"

export interface DropdownToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
}

/** A menu row with a switch, which the row's text names. */
export const DropdownToggleRow: FC<DropdownToggleRowProps> = ({ label, value, onChange }) => {
  const labelId = useId()
  return (
    <div className="atlas-dropdown-toggle-row">
      <span id={labelId} className="atlas-dropdown-toggle-row__label">{label}</span>
      <ToggleSwitch value={value} onChange={onChange} labelledBy={labelId} />
    </div>
  )
}
