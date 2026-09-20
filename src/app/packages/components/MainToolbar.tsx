import React, { useState, useCallback, useRef, useEffect, forwardRef, useMemo } from "react"
import { useAtlasStore, useViewStoreHook } from "src/app/react/ViewStoreContext"
import {
  Hand,
  Cloud,
  Type,
  Triangle,
  Ruler,
  Trash2,
  Eraser,
  ImageIcon,
  MapPin,
  Command,
  Dices,
  Circle,
  Flashlight,
  Eye,
  EyeOff,
  Paintbrush,
  Lasso,
  Square,
  BrickWall,
  DoorOpen,
  Lock,
  MousePointer2,
  Pencil,
  Lightbulb,
  Volume2,
  Stamp,
  DoorClosed,
  KeyRound,
  TriangleAlert,
  Skull,
  Flame,
  Package,
  Gem,
  Swords,
  Footprints,
  CircleX,
} from "lucide-react"


import { TooltipProvider } from "./primitives/tooltip"
import { useMapHotkeys, useHotkeyLabels } from "../../keyboard/useMapHotkeys"
import { CommandPalette } from "../../react/components/CommandPalette"
import AssetManager from "./asset-manager/AssetManager"
import { ToolButton } from "./primitives/ToolButton"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { DropdownMenu } from "./primitives/DropdownMenu"
import { DropdownMenuItem } from "./primitives/DropdownMenuItem"
import { DropdownToggleRow } from "./primitives/DropdownToggleRow"
import { DropdownSliderRow } from "./primitives/DropdownSliderRow"
import { DropdownModeSelector } from "./primitives/DropdownModeSelector"
import { Toggle } from "./primitives/Toggle"
import { DiceDropdownMenu } from "../../react/components/dice/DiceDropdownMenu"
import { AMBIENT_AUDIO_ENABLED, WALLS_AND_LIGHTING_ENABLED } from "../../featureFlags"
import { isAtlasToolAvailable } from "../../tools/toolAvailability"
import { MAP_ICON_LABELS } from "../../pixi/mapIcons"

import type { AtlasState } from '../../atlasStore';

type Tool = AtlasState['activeTool'];

/** Stampable map icons; keys match `MAP_ICON_SVG` in `pixi/mapIcons.ts`. */
const MAP_ICON_OPTIONS = [
  { key: 'door-open', icon: DoorOpen },
  { key: 'door-closed', icon: DoorClosed },
  { key: 'lock', icon: Lock },
  { key: 'key-round', icon: KeyRound },
  { key: 'triangle-alert', icon: TriangleAlert },
  { key: 'skull', icon: Skull },
  { key: 'flame', icon: Flame },
  { key: 'package', icon: Package },
  { key: 'gem', icon: Gem },
  { key: 'swords', icon: Swords },
  { key: 'footprints', icon: Footprints },
  { key: 'circle-x', icon: CircleX },
] as const;

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

interface MainToolbarProps {
  viewId?: string;
}

export const MainToolbar = forwardRef<HTMLDivElement, MainToolbarProps>(({ viewId }, ref) => {
  const activeTool = useAtlasStore(state => state.activeTool)
  const setActiveTool = useAtlasStore(state => state.setActiveTool)
  const selectionMode = useAtlasStore(state => state.selectionMode)
  const setSelectionMode = useAtlasStore(state => state.setSelectionMode)
  const store = useViewStoreHook()
  const { view } = useAtlasUI()
  const isGMView = useAtlasStore(state => state.isGMView)
  const setGMView = useAtlasStore(state => state.setGMView)
  
  // Check if this is a dedicated player view
  const isActualPlayerView = view?.getViewType?.() === 'atlas-vtt-player'
  
  const [eraserSize, setEraserSize] = useState(50)
  const [fogMode, setFogMode] = useState<'brush' | 'lasso' | 'rectangle'>('brush')
  const [, setMeasureShape] = useState<'line' | 'cone' | 'circle'>('line')
  const [measurePersist, setMeasurePersist] = useState(false)
  
  // Sync fog mode with renderer on mount
  useEffect(() => {
    if (view) {
      const eventBus = view?.serviceManager?.getEventBus?.();
      if (eventBus) {
        // Set to brush mode on mount
        eventBus.emit('fog-mode-changed', 'brush');
      }
    }
  }, [view]);
  
  
  // Get dice tool instance
  const diceTool = useMemo(() => {
    
    const toolController = view?.serviceManager?.getToolController?.();
    if (toolController) {
      const dice = toolController.getDiceTool?.();
      return dice || null;
    }
    return null;
  }, [view]);

  // Per-view UI visibility — driven by the store, not local state
  const isCommandPaletteOpen = useAtlasStore(s => s.isCommandPaletteOpen)
  const setCommandPaletteOpen = useAtlasStore(s => s.setCommandPaletteOpen)
  const isAssetManagerOpen = useAtlasStore(s => s.isAssetManagerOpen)
  const assetManagerInitialTab = useAtlasStore(s => s.assetManagerInitialTab)
  const isDiceTrayOpen = useAtlasStore(s => s.isDiceTrayOpen)
  const setDiceTrayOpen = useAtlasStore(s => s.setDiceTrayOpen)

  // Simple state for each dropdown
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false)
  const [fogDropdownOpen, setFogDropdownOpen] = useState(false)
  const [drawDropdownOpen, setDrawDropdownOpen] = useState(false)
  const [measureDropdownOpen, setMeasureDropdownOpen] = useState(false)
  const [wallDropdownOpen, setWallDropdownOpen] = useState(false)
  const [wallDrawMode, setWallDrawMode] = useState<'point-to-point' | 'freeform'>('point-to-point')

  // Ink settings for the draw tool (white / black pen + icon stamps)
  const [drawColor, setDrawColor] = useState<'#ffffff' | '#000000'>('#ffffff')
  const [drawWidth, setDrawWidth] = useState(4)
  const [drawIcon, setDrawIcon] = useState<string>('door-open')
  const [eraserWidth, setEraserWidth] = useState(40)

  // Text styling, applied to the selected element or used as the next default
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(24)
  const [textBold, setTextBold] = useState(false)
  const [wallSubMode, setWallSubMode] = useState<'draw' | 'place-light'>('draw')
  const [textDropdownOpen, setTextDropdownOpen] = useState(false)

  // Refs for tool buttons and chevrons
  const moveToolRef = useRef<HTMLDivElement>(null)
  const fogToolRef = useRef<HTMLDivElement>(null)
  const measureToolRef = useRef<HTMLDivElement>(null)
  const wallToolRef = useRef<HTMLDivElement>(null)
  const moveChevronRef = useRef<HTMLButtonElement>(null)
  const fogChevronRef = useRef<HTMLButtonElement>(null)
  const measureChevronRef = useRef<HTMLButtonElement>(null)
  const drawToolRef = useRef<HTMLDivElement>(null)
  const drawChevronRef = useRef<HTMLButtonElement>(null)
  const textToolRef = useRef<HTMLDivElement>(null)
  const textChevronRef = useRef<HTMLButtonElement>(null)

  const wallChevronRef = useRef<HTMLButtonElement>(null)
  const diceButtonRef = useRef<HTMLDivElement>(null)

  // Add a new ref for the toolbar container
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Keep the drawing renderer in sync with the toolbar's ink settings
  useEffect(() => {
    const eventBus = view?.serviceManager?.getEventBus?.();
    if (eventBus) {
      eventBus.emit('drawing-settings-changed', {
        color: drawColor,
        width: drawWidth,
        icon: drawIcon,
        eraserWidth,
      });
    }
  }, [view, drawColor, drawWidth, drawIcon, eraserWidth]);

  const isTextToolAvailable = isAtlasToolAvailable('text')

  useEffect(() => {
    const eventBus = view?.serviceManager?.getEventBus?.();
    if (eventBus) {
      eventBus.emit('text-settings-changed', {
        color: textColor,
        fontSize: textSize,
        bold: textBold,
      });
    }
  }, [view, textColor, textSize, textBold]);

  /**
   * Styling applies to the selected text element when there is exactly one,
   * otherwise it becomes the default for the next text placed.
   */
  const applyTextSetting = useCallback((updates: Partial<{ color: string; fontSize: number; bold: boolean }>) => {
    const state = store.getState();
    const selected = (state.selectedIds as string[]).filter((id: string) => id.startsWith('text_'));
    if (selected.length === 1) {
      state.updateText(selected[0]!, updates);
    }
  }, [store])

  // Update the handleToolClick function to prevent reopening the command palette when it's already open
  const handleToolClick = useCallback((tool: Tool) => {
    if (!isAtlasToolAvailable(tool)) {
      return
    }
    setActiveTool(tool)
    // Close dropdowns when a main tool is clicked
    setMoveDropdownOpen(false)
    setFogDropdownOpen(false)
    setMeasureDropdownOpen(false)
    setWallDropdownOpen(false)
    setDrawDropdownOpen(false)
  }, [setActiveTool])

  // Handle asset manager opening without changing active tool
  const handleAssetManagerClick = useCallback(() => {
    store.getState().openAssetManager()
    // Hide all note previews when opening asset manager
    const notePreviewManager = view?.serviceManager?.getNotePreviewUIManager?.();
    if (notePreviewManager) {
      notePreviewManager.hideAllPreviews();
    }
    // Close dropdowns when asset manager is opened
    setMoveDropdownOpen(false)
    setFogDropdownOpen(false)
    setMeasureDropdownOpen(false)
    setWallDropdownOpen(false)
    setDrawDropdownOpen(false)
  }, [view, store])

  // Handle closing asset manager
  const handleCloseAssetManager = useCallback(() => {
    store.getState().closeAssetManager()
    // Show all note previews when closing asset manager
    const notePreviewManager = view?.serviceManager?.getNotePreviewUIManager?.();
    if (notePreviewManager) {
      notePreviewManager.showAllPreviews();
    }
  }, [view, store])

  // Handle asset manager toggle (for keyboard shortcut)
  const handleAssetManagerToggle = useCallback(() => {
    if (store.getState().isAssetManagerOpen) {
      handleCloseAssetManager()
    } else {
      handleAssetManagerClick()
    }
  }, [handleCloseAssetManager, handleAssetManagerClick, store])

  // Handle cycling through move tool family (move/laser pointer)
  const handleMoveToolCycle = useCallback(() => {
    const moveToolFamily = ['move', 'laser-pointer'];
    
    // If current tool is not in move family, select move tool
    if (!moveToolFamily.includes(activeTool)) {
      handleToolClick('move');
      return;
    }
    
    // Otherwise, cycle to next tool in family
    const currentIndex = moveToolFamily.indexOf(activeTool);
    const nextIndex = (currentIndex + 1) % moveToolFamily.length;
    handleToolClick(moveToolFamily[nextIndex] as Tool);
  }, [activeTool, handleToolClick])

  // Handle cycling through fog tool family
  // Handle cycling through draw tool family (pen/stamp/eraser)
  const handleDrawToolCycle = useCallback(() => {
    const drawToolFamily = ['draw-pen', 'draw-icon', 'draw-eraser'];

    if (!drawToolFamily.includes(activeTool)) {
      handleToolClick('draw-pen');
      return;
    }

    const currentIndex = drawToolFamily.indexOf(activeTool);
    const nextIndex = (currentIndex + 1) % drawToolFamily.length;
    handleToolClick(drawToolFamily[nextIndex] as Tool);
  }, [activeTool, handleToolClick])

  const handleFogToolCycle = useCallback(() => {
    const fogToolFamily = ['fog', 'eraser'];
    
    // If current tool is not in fog family, select fog tool
    if (!fogToolFamily.includes(activeTool)) {
      handleToolClick('fog');
      return;
    }
    
    // Otherwise, cycle to next tool in family
    const currentIndex = fogToolFamily.indexOf(activeTool);
    const nextIndex = (currentIndex + 1) % fogToolFamily.length;
    handleToolClick(fogToolFamily[nextIndex] as Tool);
  }, [activeTool, handleToolClick])
  
  // Handle cycling through measure tool family
  const handleMeasureToolCycle = useCallback(() => {
    const measureToolFamily = ['measure', 'measure-circle', 'measure-cone'];
    
    // If current tool is not in measure family, select measure tool
    if (!measureToolFamily.includes(activeTool)) {
      handleToolClick('measure');
      setMeasureShape('line');
      return;
    }
    
    // Otherwise, cycle to next tool in family
    const currentIndex = measureToolFamily.indexOf(activeTool);
    const nextIndex = (currentIndex + 1) % measureToolFamily.length;
    const nextTool = measureToolFamily[nextIndex] as Tool;
    
    // Update shape state based on tool
    if (nextTool === 'measure') {
      setMeasureShape('line');
    } else if (nextTool === 'measure-circle') {
      setMeasureShape('circle');
    } else if (nextTool === 'measure-cone') {
      setMeasureShape('cone');
    }
    
    // Emit shape change event
    const eventBus = view?.serviceManager?.getEventBus?.();
    if (eventBus) {
      const shape = nextTool === 'measure' ? 'line' : 
                    nextTool === 'measure-circle' ? 'circle' : 'cone';
      eventBus.emit('measure-shape-changed', shape);
    }
    
    handleToolClick(nextTool);
  }, [activeTool, handleToolClick, view])


  const toggleGMView = useCallback(() => {
    setGMView(!isGMView)
  }, [isGMView, setGMView])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moveDropdownOpen &&
        moveToolRef.current &&
        !moveToolRef.current.contains(event.target as Node) &&
        moveChevronRef.current &&
        !moveChevronRef.current.contains(event.target as Node)
      ) {
        setMoveDropdownOpen(false)
      }
      if (
        fogDropdownOpen &&
        fogToolRef.current &&
        !fogToolRef.current.contains(event.target as Node) &&
        fogChevronRef.current &&
        !fogChevronRef.current.contains(event.target as Node)
      ) {
        setFogDropdownOpen(false)
      }
      if (
        measureDropdownOpen &&
        measureToolRef.current &&
        !measureToolRef.current.contains(event.target as Node) &&
        measureChevronRef.current &&
        !measureChevronRef.current.contains(event.target as Node)
      ) {
        setMeasureDropdownOpen(false)
      }
      if (
        wallDropdownOpen &&
        wallToolRef.current &&
        !wallToolRef.current.contains(event.target as Node) &&
        wallChevronRef.current &&
        !wallChevronRef.current.contains(event.target as Node)
      ) {
        setWallDropdownOpen(false)
      }
      if (
        drawDropdownOpen &&
        drawToolRef.current &&
        !drawToolRef.current.contains(event.target as Node) &&
        drawChevronRef.current &&
        !drawChevronRef.current.contains(event.target as Node)
      ) {
        setDrawDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [moveDropdownOpen, fogDropdownOpen, measureDropdownOpen, wallDropdownOpen, drawDropdownOpen])

  // Handle select all tokens (Cmd/Ctrl + A)
  const handleSelectAllTokens = useCallback(() => {
    const tokens = store.getState().objects.tokens;
    const allTokenIds = Object.keys(tokens);
    if (allTokenIds.length > 0) {
      store.getState().setSelection(allTokenIds);
    }
  }, [store]);

  const hotkeyLabel = useHotkeyLabels();

  // All map bindings come from the same registry as settings and help.
  useMapHotkeys({
    move: () => handleMoveToolCycle(),
    fog: () => !isActualPlayerView && handleFogToolCycle(),
    text: () => !isActualPlayerView && handleToolClick("text"),
    measure: () => handleMeasureToolCycle(),
    draw: () => !isActualPlayerView && handleDrawToolCycle(),
    erase: () => !isActualPlayerView && handleToolClick("eraser"),
    gmView: () => !isActualPlayerView && toggleGMView(),
    selectAll: () => !isActualPlayerView && handleSelectAllTokens(),
    assets: () => !isActualPlayerView && handleAssetManagerToggle(),
    pin: () => !isActualPlayerView && handleToolClick("note-pin"),
    wall: () => WALLS_AND_LIGHTING_ENABLED && !isActualPlayerView && handleToolClick("wall"),
    audio: () => AMBIENT_AUDIO_ENABLED && !isActualPlayerView && handleToolClick("audio" as Tool),
    diceTray: () => store.getState().setDiceTrayOpen(!store.getState().isDiceTrayOpen),
    initiative: () => {
      if (isActualPlayerView) return;
      // Read current state from store to avoid stale closure
      const currentOpen = store.getState().initiativeTrackerOpen;
      store.getState().setInitiativeTrackerOpen(!currentOpen);
    },
    palette: () => {
      store.getState().setCommandPaletteOpen(!store.getState().isCommandPaletteOpen)
    },
    cancel: () => {
      setMoveDropdownOpen(false)
      setFogDropdownOpen(false)
      setMeasureDropdownOpen(false)
      setWallDropdownOpen(false)
      setDrawDropdownOpen(false)
      if (store.getState().isAssetManagerOpen) {
        handleCloseAssetManager()
      }
    },
  }, viewId)


  return (
    
    <TooltipProvider delayDuration={300}>
        <div
          ref={ref || toolbarRef}
          className="atlas-vtt-toolbar"
        >
          {/* Move Tool */}
          <div ref={moveToolRef} className="atlas-tool-group">
              <ToolButton
                icon={activeTool === "laser-pointer" ? Flashlight : Hand}
                label={activeTool === "laser-pointer" ? "Laser Pointer" : "Move/Select"}
                shortcut={hotkeyLabel('move')}
                isActive={activeTool === "move" || activeTool === "laser-pointer"}
                onClick={() => handleToolClick(activeTool === "laser-pointer" ? "laser-pointer" : "move")}
              />

              {/* Move Tool Chevron & Dropdown */}
              <DropdownMenu
                isOpen={moveDropdownOpen}
                onToggle={() => {
                  setMoveDropdownOpen(!moveDropdownOpen)
                  setFogDropdownOpen(false)
                            }}
                position="top"
                align="left"
                label="Move Tool Options"
                triggerRef={moveChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Hand}
                    label="Move/Select"
                    shortcut={hotkeyLabel('move')}
                    isActive={activeTool === "move"}
                    onClick={() => { handleToolClick("move"); setMoveDropdownOpen(false); }}
                  />
                  <DropdownMenuItem
                    icon={Flashlight}
                    label="Laser Pointer"
                    shortcut={hotkeyLabel('move')}
                    isActive={activeTool === "laser-pointer"}
                    onClick={() => { handleToolClick("laser-pointer"); setMoveDropdownOpen(false); }}
                  />
                </div>

                <div className="atlas-dropdown-section">
                  <DropdownToggleRow
                    label="Lasso Selection"
                    value={selectionMode === 'lasso'}
                    onChange={() => {
                      setSelectionMode(selectionMode === 'box' ? 'lasso' : 'box');
                    }}
                  />
                </div>
              </DropdownMenu>
            </div>


            {/* Fog Tool - DM Only */}
            {!isActualPlayerView && (
            <div ref={fogToolRef} className="atlas-tool-group">
              <ToolButton
                icon={activeTool === "eraser" ? Eraser : Cloud}
                label={activeTool === "eraser" ? "Fog Eraser" : "Fog Tool"}
                shortcut={hotkeyLabel('fog')}
                isActive={activeTool === "fog" || activeTool === "eraser"}
                onClick={() => handleToolClick(activeTool === "eraser" ? "eraser" : "fog")}
              />

              {/* Fog Tool Chevron */}
              <DropdownMenu
                isOpen={fogDropdownOpen}
                onToggle={() => {
                  setFogDropdownOpen(!fogDropdownOpen)
                  setMoveDropdownOpen(false)
                            }}
                position="top"
                align="left"
                label="Fog Tool Options"
                triggerRef={fogChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                {/* Fog Tool Dropdown Contents */}
                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Cloud}
                    label="Fog Tool"
                    shortcut={hotkeyLabel('fog')}
                    isActive={activeTool === "fog"}
                    onClick={() => { handleToolClick("fog"); setFogDropdownOpen(false); }}
                  />
                  <DropdownMenuItem
                    icon={Eraser}
                    label="Fog Eraser"
                    shortcut={hotkeyLabel('fog')}
                    isActive={activeTool === "eraser"}
                    onClick={() => { handleToolClick("eraser"); setFogDropdownOpen(false); }}
                  />
                </div>

                <div className="atlas-dropdown-section">
                  <div className="space-y-3">
                    <DropdownModeSelector
                      value={fogMode}
                      options={[
                        { value: 'brush' as const, icon: Paintbrush, label: 'Brush' },
                        { value: 'lasso' as const, icon: Lasso, label: 'Lasso' },
                        { value: 'rectangle' as const, icon: Square, label: 'Rectangle' },
                      ]}
                      onChange={(mode) => {
                        setFogMode(mode);
                        const eventBus = view?.serviceManager?.getEventBus?.();
                        if (eventBus) { eventBus.emit('fog-mode-changed', mode); }
                      }}
                    />

                    <DropdownSliderRow
                      label="Brush Size"
                      value={eraserSize}
                      min={10}
                      max={200}
                      onChange={(size) => {
                        setEraserSize(size);
                        if (view && view.setFogBrushSize) { view.setFogBrushSize(size); }
                      }}
                    />
                  </div>
                </div>

                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Trash2}
                    label="Delete All Fog"
                    destructive
                    onClick={() => {
                      if (view && view.clearAllFog) { view.clearAllFog(); }
                      setFogDropdownOpen(false);
                    }}
                  />
                </div>
              </DropdownMenu>
            </div>
            )}

            {/* Draw Tool - DM Only */}
            {!isActualPlayerView && (
            <div ref={drawToolRef} className="atlas-tool-group">
              <ToolButton
                icon={activeTool === "draw-eraser" ? Eraser : activeTool === "draw-icon" ? Stamp : Pencil}
                label={activeTool === "draw-eraser" ? "Drawing Eraser" : activeTool === "draw-icon" ? "Icon Stamp" : "Draw Tool"}
                shortcut={hotkeyLabel('draw')}
                isActive={activeTool === "draw-pen" || activeTool === "draw-eraser" || activeTool === "draw-icon"}
                onClick={() => handleToolClick(activeTool === "draw-eraser" || activeTool === "draw-icon" ? activeTool : "draw-pen")}
              />

              {/* Draw Tool Chevron */}
              <DropdownMenu
                isOpen={drawDropdownOpen}
                onToggle={() => {
                  setDrawDropdownOpen(!drawDropdownOpen)
                  setMoveDropdownOpen(false)
                  setFogDropdownOpen(false)
                  setMeasureDropdownOpen(false)
                }}
                position="top"
                align="left"
                label="Draw Tool Options"
                triggerRef={drawChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Pencil}
                    label="Pen"
                    shortcut={hotkeyLabel('draw')}
                    isActive={activeTool === "draw-pen"}
                    onClick={() => { handleToolClick("draw-pen"); setDrawDropdownOpen(false); }}
                  />
                  <DropdownMenuItem
                    icon={Stamp}
                    label="Icon Stamp"
                    shortcut={hotkeyLabel('draw')}
                    isActive={activeTool === "draw-icon"}
                    onClick={() => handleToolClick("draw-icon")}
                  />
                  <DropdownMenuItem
                    icon={Eraser}
                    label="Drawing Eraser"
                    shortcut={hotkeyLabel('draw')}
                    isActive={activeTool === "draw-eraser"}
                    onClick={() => { handleToolClick("draw-eraser"); setDrawDropdownOpen(false); }}
                  />
                </div>

                <div className="atlas-dropdown-section">
                  <div className="space-y-2">
                    <span className="text-sm text-[var(--text-normal)]">Icons</span>
                    <div className="atlas-icon-grid">
                      {MAP_ICON_OPTIONS.map(({ key, icon: Icon }) => (
                        <button
                          key={key}
                          type="button"
                          title={MAP_ICON_LABELS[key]}
                          aria-label={MAP_ICON_LABELS[key]}
                          aria-pressed={activeTool === "draw-icon" && drawIcon === key}
                          className={`atlas-icon-grid__item${
                            activeTool === "draw-icon" && drawIcon === key ? " atlas-icon-grid__item--active" : ""
                          }`}
                          onClick={() => { setDrawIcon(key); setActiveTool("draw-icon"); }}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="atlas-dropdown-section">
                  <div className="space-y-3">
                    <DropdownModeSelector
                      label="Ink"
                      value={drawColor}
                      options={[
                        { value: '#ffffff' as const, icon: Circle, label: 'White' },
                        { value: '#000000' as const, icon: Circle, label: 'Black' },
                      ]}
                      onChange={(color) => setDrawColor(color)}
                    />

                    <DropdownSliderRow
                      label="Pen Size"
                      value={drawWidth}
                      min={1}
                      max={40}
                      onChange={(width) => setDrawWidth(width)}
                    />

                    <DropdownSliderRow
                      label="Eraser Size"
                      value={eraserWidth}
                      min={10}
                      max={200}
                      onChange={(width) => setEraserWidth(width)}
                    />
                  </div>
                </div>

                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Trash2}
                    label="Delete All Drawings"
                    destructive
                    onClick={() => {
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('drawing-clear-all'); }
                      setDrawDropdownOpen(false);
                    }}
                  />
                </div>
              </DropdownMenu>
            </div>
            )}

            {/* Text Tool - DM Only */}
            {!isActualPlayerView && isTextToolAvailable && (
            <div ref={textToolRef} className="atlas-tool-group">
              <ToolButton
                icon={Type}
                label="Text Tool"
                shortcut={hotkeyLabel('text')}
                isActive={activeTool === "text"}
                onClick={() => handleToolClick("text")}
              />

              <DropdownMenu
                isOpen={textDropdownOpen}
                onToggle={() => {
                  setTextDropdownOpen(!textDropdownOpen)
                  setMoveDropdownOpen(false)
                  setFogDropdownOpen(false)
                  setMeasureDropdownOpen(false)
                  setDrawDropdownOpen(false)
                }}
                position="top"
                align="left"
                label="Text Options"
                triggerRef={textChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                <div className="atlas-dropdown-section">
                  <div className="space-y-2">
                    <span className="text-sm text-[var(--text-normal)]">Colour</span>
                    <div className="atlas-swatch-grid">
                      {TEXT_COLOR_SWATCHES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          title={label}
                          aria-label={label}
                          aria-pressed={textColor === value}
                          className={`atlas-swatch${textColor === value ? " atlas-swatch--active" : ""}`}
                          style={{ backgroundColor: value }}
                          onClick={() => { setTextColor(value); applyTextSetting({ color: value }); }}
                        />
                      ))}
                    </div>
                  </div>
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
              </DropdownMenu>
            </div>
            )}


            {/* Measure Tool */}
            <div ref={measureToolRef} className="atlas-tool-group">
              <ToolButton
                icon={
                  activeTool === "measure-circle" ? Circle :
                  activeTool === "measure-cone" ? Triangle :
                  Ruler
                }
                label={
                  activeTool === "measure-circle" ? "Measure Circle" :
                  activeTool === "measure-cone" ? "Measure Cone" :
                  "Measure Line"
                }
                shortcut={hotkeyLabel('measure')}
                isActive={activeTool === "measure" || activeTool === "measure-circle" || activeTool === "measure-cone"}
                onClick={() => {
                  const measureTools: Array<'measure' | 'measure-circle' | 'measure-cone'> = ['measure', 'measure-circle', 'measure-cone'];
                  if (measureTools.includes(activeTool as any)) {
                    // If already a measure tool, just re-select it
                    handleToolClick(activeTool as 'measure' | 'measure-circle' | 'measure-cone');
                  } else {
                    // Otherwise select the basic measure tool
                    handleToolClick("measure");
                    setMeasureShape('line');
                  }
                }}
              />

              {/* Measure Tool Chevron & Dropdown */}
              <DropdownMenu
                isOpen={measureDropdownOpen}
                onToggle={() => {
                  setMeasureDropdownOpen(!measureDropdownOpen)
                  setMoveDropdownOpen(false)
                  setFogDropdownOpen(false)
                            }}
                position="top"
                align="left"
                label="Measure Tool Options"
                triggerRef={measureChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                {/* Measure Tool Dropdown Contents */}
                <div className="atlas-dropdown-section">
                  <DropdownMenuItem
                    icon={Ruler}
                    label="Line"
                    isActive={activeTool === "measure"}
                    onClick={() => {
                      setMeasureShape("line");
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('measure-shape-changed', 'line'); }
                      handleToolClick("measure");
                      setMeasureDropdownOpen(false);
                    }}
                  />
                  <DropdownMenuItem
                    icon={Circle}
                    label="Circle/Sphere"
                    isActive={activeTool === "measure-circle"}
                    onClick={() => {
                      setMeasureShape("circle");
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('measure-shape-changed', 'circle'); }
                      handleToolClick("measure-circle");
                      setMeasureDropdownOpen(false);
                    }}
                  />
                  <DropdownMenuItem
                    icon={Triangle}
                    label="Cone"
                    isActive={activeTool === "measure-cone"}
                    onClick={() => {
                      setMeasureShape("cone");
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('measure-shape-changed', 'cone'); }
                      handleToolClick("measure-cone");
                      setMeasureDropdownOpen(false);
                    }}
                  />
                </div>

                <div className="atlas-dropdown-separator"></div>

                <div className="atlas-dropdown-section">
                  <DropdownToggleRow
                    label="Persist Measurements"
                    value={measurePersist}
                    onChange={() => {
                      const newPersist = !measurePersist;
                      setMeasurePersist(newPersist);
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('measure-persistence-changed', newPersist); }
                    }}
                  />
                </div>
              </DropdownMenu>
            </div>

          {/* Note Pin Tool - DM Only */}
          {!isActualPlayerView && (
          <ToolButton
            icon={MapPin}
            label="Note Pin Tool"
            shortcut={hotkeyLabel('pin')}
            isActive={activeTool === "note-pin"}
            onClick={() => handleToolClick("note-pin")}
          />
          )}

          {/* Wall & Lighting Tool - DM Only */}
          {WALLS_AND_LIGHTING_ENABLED && !isActualPlayerView && (
            <div ref={wallToolRef} className="atlas-tool-group">
              <ToolButton
                icon={BrickWall}
                label="Walls & Lighting"
                shortcut={hotkeyLabel('wall')}
                isActive={activeTool === "wall"}
                onClick={() => handleToolClick("wall")}
              />
              <DropdownMenu
                isOpen={wallDropdownOpen}
                onToggle={() => {
                  setWallDropdownOpen(!wallDropdownOpen);
                  setMoveDropdownOpen(false);
                  setFogDropdownOpen(false);
                  setMeasureDropdownOpen(false);
                }}
                position="top"
                align="left"
                label="Wall Tool Options"
                triggerRef={wallChevronRef}
                chevronClassName="h-9 w-5 p-0 ml-0 text-[var(--text-muted)] hover:text-[var(--text-normal)] hover:bg-[var(--background-modifier-hover)]"
                menuClassName="min-w-[220px] shadow-ob"
              >
                <div className="atlas-dropdown-section">
                  <DropdownModeSelector
                    value={wallSubMode}
                    options={[
                      { value: 'draw' as const, icon: BrickWall, label: 'Draw Walls' },
                      { value: 'place-light' as const, icon: Lightbulb, label: 'Place Light' },
                    ]}
                    onChange={(mode) => {
                      setWallSubMode(mode);
                      const eventBus = view?.serviceManager?.getEventBus?.();
                      if (eventBus) { eventBus.emit('wall-submode-changed', mode); }
                    }}
                  />
                </div>

                {wallSubMode === 'draw' && (
                  <div className="atlas-dropdown-section">
                    <DropdownModeSelector
                      value={wallDrawMode}
                      options={[
                        { value: 'point-to-point' as const, icon: MousePointer2, label: 'Point-to-Point' },
                        { value: 'freeform' as const, icon: Pencil, label: 'Freeform Draw' },
                      ]}
                      onChange={(mode) => {
                        setWallDrawMode(mode);
                        const eventBus = view?.serviceManager?.getEventBus?.();
                        if (eventBus) { eventBus.emit('wall-mode-changed', mode); }
                      }}
                    />
                  </div>
                )}
              </DropdownMenu>
            </div>
          )}

          {/* Audio Tool - DM Only */}
          {AMBIENT_AUDIO_ENABLED && !isActualPlayerView && (
            <ToolButton
              icon={Volume2}
              label="Ambient Sound"
              shortcut={hotkeyLabel('audio')}
              isActive={activeTool === "audio"}
              onClick={() => handleToolClick("audio" as Tool)}
            />
          )}

          {/* Dice Tool */}
          <div ref={diceButtonRef} className="relative flex items-center">
            <ToolButton
              icon={Dices}
              label="Roll Dice"
              shortcut={hotkeyLabel('diceTray')}
              isActive={isDiceTrayOpen}
              onClick={() => {
                setDiceTrayOpen(!isDiceTrayOpen);
                // Close other dropdowns
                setMoveDropdownOpen(false);
                setFogDropdownOpen(false);
                setMeasureDropdownOpen(false);
              }}
            />

            {/* Dice Dropdown Menu */}
            {diceTool && (
              <DiceDropdownMenu
                diceTool={diceTool}
                isOpen={isDiceTrayOpen}
                onToggle={() => {
                  setDiceTrayOpen(!isDiceTrayOpen);
                  // Close other dropdowns
                  setMoveDropdownOpen(false);
                  setFogDropdownOpen(false);
                  setMeasureDropdownOpen(false);
                }}
                triggerRef={diceButtonRef}
              />
            )}
          </div>

          {/* Asset Manager Button - DM Only */}
          {!isActualPlayerView && (
            <ToolButton
              icon={ImageIcon}
              label="Asset Manager"
              shortcut={hotkeyLabel('assets')}
              isActive={isAssetManagerOpen}
              onClick={handleAssetManagerClick}
            />
          )}

          {/* Command Palette Button - DM Only */}
          {!isActualPlayerView && (
            <ToolButton
              icon={Command}
              label="Command Palette"
              shortcut={hotkeyLabel('palette')}
              isActive={isCommandPaletteOpen}
              onClick={() => setCommandPaletteOpen(!isCommandPaletteOpen)}
            />
          )}

          {/* GM View / Session View Toggle - DM Only */}
          {!isActualPlayerView && (
            <Toggle
              value={isGMView}
              onChange={toggleGMView}
              iconOn={Eye}
              iconOff={EyeOff}
              tooltipOn={`GM View (${hotkeyLabel('gmView')})`}
              tooltipOff={`Session View (${hotkeyLabel('gmView')})`}
            />
          )}
      </div>
      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        toolbarRef={toolbarRef}
      />
      <AssetManager 
        isOpen={isAssetManagerOpen} 
        onClose={handleCloseAssetManager} 
        {...(assetManagerInitialTab && { initialTab: assetManagerInitialTab })} 
      />
      {isDiceTrayOpen && !diceTool && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--background-primary)',
          padding: 'var(--atlas-spacing-xl)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: 'var(--atlas-radius-l)',
          zIndex: 1000
        }}>
          <p>Dice tool not initialized. Please try reloading the view.</p>
          <button onClick={() => setDiceTrayOpen(false)}>Close</button>
        </div>
      )}
    </TooltipProvider>
  );
});

MainToolbar.displayName = 'MainToolbar';
