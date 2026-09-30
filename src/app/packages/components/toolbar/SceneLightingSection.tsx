import React from "react"
import { RotateCcw } from "lucide-react"
import type { SceneLighting } from "../../../types/lightingTypes"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"

type TimeOfDay = 'day' | 'dusk' | 'night' | 'dark'

const TIMES_OF_DAY: { value: TimeOfDay; label: string; ambient: number }[] = [
  { value: 'day', label: 'Day', ambient: 1 },
  { value: 'dusk', label: 'Dusk', ambient: 0.5 },
  { value: 'night', label: 'Night', ambient: 0.15 },
  { value: 'dark', label: 'Pitch black', ambient: 0 },
]

interface SceneLightingSectionProps {
  lighting: SceneLighting
  onChange: (changes: Partial<SceneLighting>) => void
  /** The GM's canvas shows exactly what the players see. */
  preview: boolean
  onPreviewChange: (preview: boolean) => void
  onResetExplored: () => void
}

/** Scene-wide lighting in the lighting tool's menu: on or off, how dark, and the players' view. */
export function SceneLightingSection({ lighting, onChange, preview, onPreviewChange, onResetExplored }: SceneLightingSectionProps): React.ReactElement {
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === lighting.ambient)?.value ?? 'custom'
  return (
    <div className="atlas-dropdown-section">
      <DropdownToggleRow label="Dynamic lighting" value={lighting.enabled} onChange={() => onChange({ enabled: !lighting.enabled })} />
      {lighting.enabled && (
        <>
          <SegmentedControl<TimeOfDay | 'custom'>
            value={time}
            options={TIMES_OF_DAY}
            ariaLabel="Time of day"
            onChange={(value) => {
              const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value)
              if (stop) onChange({ ambient: stop.ambient })
            }}
          />
          <DropdownSliderRow
            label="Ambient light"
            value={Math.round(lighting.ambient * 100)}
            min={0}
            max={100}
            unit="%"
            onChange={(percent) => onChange({ ambient: percent / 100 })}
          />
          <DropdownToggleRow label="Preview player view" value={preview} onChange={() => onPreviewChange(!preview)} />
          <DropdownMenuItem icon={RotateCcw} label="Forget explored areas" onClick={onResetExplored} />
        </>
      )}
    </div>
  )
}
