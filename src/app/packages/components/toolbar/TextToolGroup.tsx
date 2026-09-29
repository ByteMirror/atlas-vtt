import React, { useCallback, useEffect, useState } from "react"
import { useViewStoreHook } from "src/app/react/ViewStoreContext"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownSwatchGrid } from "../primitives/DropdownSwatchGrid"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { textToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

/** Preset text colours: high-contrast neutrals plus map-legible accents. */
const TEXT_COLOR_SWATCHES = [
  { value: '#ffffff', label: 'White' },
  { value: '#000000', label: 'Black' },
  { value: '#e93147', label: 'Red' },
  { value: '#ec7500', label: 'Orange' },
  { value: '#e0ac00', label: 'Yellow' },
  { value: '#08b94e', label: 'Green' },
  { value: '#086ddd', label: 'Blue' },
  { value: '#7852ee', label: 'Purple' },
] as const;

type TextSettings = { color: string; fontSize: number; bold: boolean }

/** The text tool, with colour, size and weight. DM only. */
export function TextToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const store = useViewStoreHook()
  const emit = useEmitViewEvent()
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(24)
  const [textBold, setTextBold] = useState(false)
  const face = textToolFace(activeTool)

  useEffect(() => {
    emit('text-settings-changed', { color: textColor, fontSize: textSize, bold: textBold });
  }, [emit, textColor, textSize, textBold]);

  /**
   * Styling applies to the selected text element when there is exactly one,
   * otherwise it becomes the default for the next text placed.
   */
  const applyTextSetting = useCallback((updates: Partial<TextSettings>): void => {
    const state = store.getState();
    const selected = state.selectedIds.filter((id) => id.startsWith('text_'));
    if (selected.length === 1) {
      state.updateText(selected[0]!, updates);
    }
  }, [store])

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('text')}
      menuLabel="Text Options"
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownSwatchGrid
          label="Colour"
          swatches={TEXT_COLOR_SWATCHES}
          value={textColor}
          onChange={(value) => { setTextColor(value); applyTextSetting({ color: value }); }}
        />
      </div>

      <div className="atlas-dropdown-section">
        <div className="space-y-3">
          <DropdownSliderRow
            label="Size"
            value={textSize}
            min={10}
            max={96}
            onChange={(size) => { setTextSize(size); applyTextSetting({ fontSize: size }); }}
          />

          <DropdownToggleRow
            label="Bold"
            value={textBold}
            onChange={() => {
              const bold = !textBold;
              setTextBold(bold);
              applyTextSetting({ bold });
            }}
          />
        </div>
      </div>
    </ToolGroup>
  )
}
