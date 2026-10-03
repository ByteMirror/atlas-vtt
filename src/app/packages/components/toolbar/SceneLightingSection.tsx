import React from "react"
import { Eye, RotateCcw, SlidersHorizontal } from "lucide-react"
import { DEFAULT_AMBIENT_COLOR } from "../../../lighting/sceneLightingOptions"
import { TIMES_OF_DAY, type TimeOfDay } from "../../../lighting/timesOfDay"
import type { SceneLighting } from "../../../types/lightingTypes"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { LabelTooltip } from "../primitives/tooltip"


interface SceneLightingSectionProps {
  lighting: SceneLighting
  onChange: (changes: Partial<SceneLighting>) => void
  onResetExplored: () => void
  /** Marks the whole map as explored; offered while the tool edits the explored memory. */
  onRevealExplored?: () => void
  /** Opens the panel with the scene's other lighting options. */
  onOpenSettings: () => void
}

/**
 * Scene-wide lighting in the lighting tool's menu: a section with the switch and how dark the
 * scene is, and one with its actions. The players' view of it is session view, not shown here.
 * While lighting is off everything but the switch is shown disabled, so the menu keeps its
 * shape and the switch its place.
 */
export function SceneLightingSection({ lighting, onChange, onResetExplored, onRevealExplored, onOpenSettings }: SceneLightingSectionProps): React.ReactElement {
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === lighting.ambient)?.value ?? 'custom'
  const disabled = !lighting.enabled
  return (
    <>
      <div className="atlas-dropdown-section atlas-scene-lighting">
        <DropdownToggleRow label="Dynamic lighting" value={lighting.enabled} onChange={() => onChange({ enabled: !lighting.enabled })} />
        <SegmentedControl<TimeOfDay | 'custom'>
          value={time}
          options={TIMES_OF_DAY}
          ariaLabel="Time of day"
          disabled={disabled}
          onChange={(value) => {
            const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value)
            if (stop) onChange({ ambient: stop.ambient })
          }}
        />
        <div className="atlas-scene-lighting__ambient">
          <DropdownSliderRow
            label="Ambient light"
            value={Math.round(lighting.ambient * 100)}
            min={0}
            max={100}
            unit="%"
            disabled={disabled}
            onChange={(percent) => onChange({ ambient: percent / 100 })}
          />
          <LabelTooltip label="Ambient colour">
            <input
              type="color"
              className="atlas-swatch atlas-swatch--picker"
              value={lighting.ambientColor ?? DEFAULT_AMBIENT_COLOR}
              disabled={disabled}
              onChange={(event) => onChange({ ambientColor: event.target.value })}
            />
          </LabelTooltip>
        </div>
      </div>
      <div className="atlas-dropdown-section">
        {onRevealExplored && <DropdownMenuItem icon={Eye} label="Mark all areas explored" disabled={disabled} onClick={onRevealExplored} />}
        <DropdownMenuItem icon={RotateCcw} label="Forget explored areas" disabled={disabled} onClick={onResetExplored} />
        <DropdownMenuItem icon={SlidersHorizontal} label="Lighting settings…" disabled={disabled} onClick={onOpenSettings} />
      </div>
    </>
  )
}
