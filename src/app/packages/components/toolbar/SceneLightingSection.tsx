import { t } from '../../../i18n';
import React from "react"
import { RotateCcw, SlidersHorizontal } from "lucide-react"
import { DEFAULT_AMBIENT_COLOR } from "../../../lighting/sceneLightingOptions"
import type { SceneLighting } from "../../../types/lightingTypes"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { LabelTooltip } from "../primitives/tooltip"

type TimeOfDay = 'day' | 'dusk' | 'night' | 'dark'

const TIMES_OF_DAY: { value: TimeOfDay; label: string; ambient: number }[] = [
  { value: 'day', label: t('sceneLight.day'), ambient: 1 },
  { value: 'dusk', label: t('sceneLight.dusk'), ambient: 0.5 },
  { value: 'night', label: t('sceneLight.night'), ambient: 0.15 },
  { value: 'dark', label: t('sceneLight.dark'), ambient: 0 },
]

interface SceneLightingSectionProps {
  lighting: SceneLighting
  onChange: (changes: Partial<SceneLighting>) => void
  /** The GM's canvas shows exactly what the players see. */
  preview: boolean
  onPreviewChange: (preview: boolean) => void
  onResetExplored: () => void
  /** Opens the panel with the scene's other lighting options. */
  onOpenSettings: () => void
}

/** Scene-wide lighting in the lighting tool's menu: on or off, how dark, and the players' view. */
export function SceneLightingSection({ lighting, onChange, preview, onPreviewChange, onResetExplored, onOpenSettings }: SceneLightingSectionProps): React.ReactElement {
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === lighting.ambient)?.value ?? 'custom'
  return (
    <div className="atlas-dropdown-section">
      <DropdownToggleRow label={t('sceneLight.dynamic')} value={lighting.enabled} onChange={() => onChange({ enabled: !lighting.enabled })} />
      {lighting.enabled && (
        <>
          <SegmentedControl<TimeOfDay | 'custom'>
            value={time}
            options={TIMES_OF_DAY}
            ariaLabel={t('sceneLight.timeOfDay')}
            onChange={(value) => {
              const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value)
              if (stop) onChange({ ambient: stop.ambient })
            }}
          />
          <div className="atlas-scene-lighting-ambient">
            <DropdownSliderRow
              label={t('sceneLight.ambient')}
              value={Math.round(lighting.ambient * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(percent) => onChange({ ambient: percent / 100 })}
            />
            <LabelTooltip label={t('sceneLight.ambientColour')}>
              <input
                type="color"
                className="atlas-scene-lighting-ambient__swatch"
                value={lighting.ambientColor ?? DEFAULT_AMBIENT_COLOR}
                onChange={(event) => onChange({ ambientColor: event.target.value })}
              />
            </LabelTooltip>
          </div>
          <DropdownToggleRow label={t('sceneLight.preview')} value={preview} onChange={() => onPreviewChange(!preview)} />
          <DropdownMenuItem icon={RotateCcw} label={t('sceneLight.forgetExplored')} onClick={onResetExplored} />
          <DropdownMenuItem icon={SlidersHorizontal} label={t('sceneLight.openSettings')} onClick={onOpenSettings} />
        </>
      )}
    </div>
  )
}
