import React from "react"
import type { ExploredBrushOptions, ExploredEditMode } from "../../../lighting/exploredEdits"
import type { StrokeMode } from "../../../tools/shapeStroke"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { SegmentedControl, type SegmentedOption } from "../primitives/SegmentedControl"

const MODES: readonly SegmentedOption<ExploredEditMode>[] = [
  { value: 'reveal', label: 'Reveal' },
  { value: 'forget', label: 'Forget' },
]

const SHAPES: readonly SegmentedOption<StrokeMode>[] = [
  { value: 'brush', label: 'Brush' },
  { value: 'lasso', label: 'Lasso' },
  { value: 'rectangle', label: 'Rectangle' },
]

interface ExploredMemorySectionProps {
  options: ExploredBrushOptions
  onChange: (changes: Partial<ExploredBrushOptions>) => void
}

/**
 * The explored-memory mode's choices in the lighting tool's menu: whether a stroke marks an
 * area as explored or takes its memory away, the stroke's shape, and the brush's size.
 */
export function ExploredMemorySection({ options, onChange }: ExploredMemorySectionProps): React.ReactElement {
  return (
    <div className="atlas-dropdown-section atlas-explored-brush">
      <SegmentedControl value={options.mode} options={MODES} ariaLabel="What a stroke does" onChange={(mode) => onChange({ mode })} />
      <SegmentedControl value={options.shape} options={SHAPES} ariaLabel="Shape of a stroke" onChange={(shape) => onChange({ shape })} />
      {options.shape === 'brush' && (
        <DropdownSliderRow label="Brush size" value={options.brushSize} min={10} max={200} onChange={(brushSize) => onChange({ brushSize })} />
      )}
    </div>
  )
}
