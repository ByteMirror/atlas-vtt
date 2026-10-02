import { t } from '../../../i18n';
import React, { useState } from "react"
import { BrickWall, Flame, FlameKindling, Lamp, Lightbulb, MousePointer2, Pencil, Sparkles } from "lucide-react"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, type LightPresetId } from "../../../lighting/lightPresets"
import { DropdownModeSelector, type ModeSelectorOption } from "../primitives/DropdownModeSelector"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

const PRESET_ICONS: Record<LightPresetId, ModeSelectorOption<LightPresetId>['icon']> = {
  candle: Flame,
  torch: FlameKindling,
  lantern: Lamp,
  magical: Sparkles,
}

const PRESET_OPTIONS: ModeSelectorOption<LightPresetId>[] = LIGHT_PRESET_IDS.map((id) => ({
  value: id,
  icon: PRESET_ICONS[id],
  label: LIGHT_PRESETS[id].label,
}))

/** Walls, lights and the scene's lighting in one place. DM only, behind WALLS_AND_LIGHTING_ENABLED. */
export function LightingToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const lighting = useAtlasStore((state) => state.lighting)
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting)
  const setSceneLightingPanelOpen = useAtlasStore((state) => state.setSceneLightingPanelOpen)
  const [subMode, setSubMode] = useState<'draw' | 'place-light'>('draw')
  const [drawMode, setDrawMode] = useState<'point-to-point' | 'freeform'>('point-to-point')
  const [preset, setPreset] = useState<LightPresetId>('torch')
  const [preview, setPreview] = useState(false)
  const face = lightingToolFace(activeTool)

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('wall')}
      menuLabel={t('toolbar.lightingOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownModeSelector
          value={subMode}
          options={[
            { value: 'draw' as const, icon: BrickWall, label: t('toolbar.drawWalls') },
            { value: 'place-light' as const, icon: Lightbulb, label: t('toolbar.placeLights') },
          ]}
          onChange={(mode) => {
            setSubMode(mode)
            emit('wall-submode-changed', mode)
            selectTool('wall')
          }}
        />
      </div>

      <div className="atlas-dropdown-section">
        {subMode === 'draw' ? (
          <DropdownModeSelector
            value={drawMode}
            options={[
              { value: 'point-to-point' as const, icon: MousePointer2, label: t('toolbar.pointToPoint') },
              { value: 'freeform' as const, icon: Pencil, label: t('toolbar.freehand') },
            ]}
            onChange={(mode) => {
              setDrawMode(mode)
              emit('wall-mode-changed', mode)
            }}
          />
        ) : (
          <DropdownModeSelector
            value={preset}
            options={PRESET_OPTIONS}
            onChange={(next) => {
              setPreset(next)
              emit('lighting-preset-changed', next)
            }}
          />
        )}
      </div>

      <SceneLightingSection
        lighting={lighting}
        onChange={setSceneLighting}
        preview={preview}
        onPreviewChange={(next) => {
          setPreview(next)
          emit('lighting-preview', next)
        }}
        onResetExplored={() => {
          emit('lighting-reset-explored')
          closeMenu()
        }}
        onOpenSettings={() => {
          setSceneLightingPanelOpen(true)
          closeMenu()
        }}
      />
    </ToolGroup>
  )
}
