import React, { FC } from "react"
import { Check, X } from "lucide-react"

export interface DropdownToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
}

export const DropdownToggleRow: FC<DropdownToggleRowProps> = ({
  label,
  value,
  onChange,
}) => (
  <div className="atlas-dropdown-menu-item atlas-dropdown-toggle-row">
    <span className="text-sm text-[var(--text-normal)]" style={{ gridColumn: '1 / 4' }}>{label}</span>
    <div className="atlas-toggle" onClick={onChange}>
      <div className={value ? "atlas-toggle__switch atlas-toggle__switch--on" : "atlas-toggle__switch atlas-toggle__switch--off"}>
        <div className={value ? "atlas-toggle__thumb atlas-toggle__thumb--on" : "atlas-toggle__thumb atlas-toggle__thumb--off"}>
          {value ? <Check className="atlas-toggle__icon" /> : <X className="atlas-toggle__icon" />}
        </div>
      </div>
    </div>
  </div>
)
