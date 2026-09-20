import React, { FC } from "react"
import { Slider } from "./slider"

export interface DropdownSliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

const ROW_STYLE: React.CSSProperties = { paddingBottom: '0.75rem' }

export const DropdownSliderRow: FC<DropdownSliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  onChange,
}) => (
  <div className="space-y-2" style={ROW_STYLE}>
    <div className="flex justify-between">
      <span className="text-sm text-[var(--text-normal)]">{label}</span>
      <span className="text-xs text-[var(--text-muted)]">{value}{unit}</span>
    </div>
    <Slider
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v: number[]) => onChange(v[0] ?? value)}
      className="w-full"
    />
  </div>
)
