import React, { useState } from "react"
import { BrickWall, Lightbulb, MousePointer2, Pencil } from "lucide-react"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownModeSelector } from "../primitives/DropdownModeSelector"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { wallToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

/** Walls and lights, with how walls are drawn. DM only, behind WALLS_AND_LIGHTING_ENABLED. */
export function WallToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const [subMode, setSubMode] = useState<'draw' | 'place-light'>('draw')
  const [drawMode, setDrawMode] = useState<'point-to-point' | 'freeform'>('point-to-point')
  const face = wallToolFace(activeTool)

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('wall')}
      menuLabel="Wall Tool Options"
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownModeSelector
          value={subMode}
          options={[
            { value: 'draw' as const, icon: BrickWall, label: 'Draw Walls' },
            { value: 'place-light' as const, icon: Lightbulb, label: 'Place Light' },
          ]}
          onChange={(mode) => {
            setSubMode(mode);
            emit('wall-submode-changed', mode);
          }}
        />
      </div>

      {subMode === 'draw' && (
        <div className="atlas-dropdown-section">
          <DropdownModeSelector
            value={drawMode}
            options={[
              { value: 'point-to-point' as const, icon: MousePointer2, label: 'Point-to-Point' },
              { value: 'freeform' as const, icon: Pencil, label: 'Freeform Draw' },
            ]}
            onChange={(mode) => {
              setDrawMode(mode);
              emit('wall-mode-changed', mode);
            }}
          />
        </div>
      )}
    </ToolGroup>
  )
}
