import React from "react"
import { MapPin, Volume2 } from "lucide-react"
import { AMBIENT_AUDIO_ENABLED, WALLS_AND_LIGHTING_ENABLED } from "../../../../featureFlags"
import { isAtlasToolAvailable } from "../../../../tools/toolAvailability"
import { DrawToolGroup } from "../DrawToolGroup"
import { FogToolGroup } from "../FogToolGroup"
import { MeasureToolGroup } from "../MeasureToolGroup"
import { MoveToolGroup } from "../MoveToolGroup"
import { TextToolGroup } from "../TextToolGroup"
import { WallToolGroup } from "../WallToolGroup"
import { buttonItem, toolGroupItem } from "../toolbarItems"
import { drawToolFace, fogToolFace, measureToolFace, moveToolFace, textToolFace, wallToolFace } from "../toolFaces"
import type { ToolbarControl } from "../toolbarControl"

/** The map tools, from the ones a GM reaches for during play down to setup and reference tools. */
export const TOOL_CONTROLS: ToolbarControl[] = [
  {
    id: 'move', priority: 100, dmOnly: false, available: true,
    item: ctx => toolGroupItem(ctx, 'move', moveToolFace(ctx.activeTool), <MoveToolGroup {...ctx.groupControls('move')} />),
  },
  {
    id: 'fog', priority: 85, dmOnly: true, available: true,
    item: ctx => toolGroupItem(ctx, 'fog', fogToolFace(ctx.activeTool), <FogToolGroup {...ctx.groupControls('fog')} />),
  },
  {
    id: 'draw', priority: 65, dmOnly: true, available: true,
    item: ctx => toolGroupItem(ctx, 'draw', drawToolFace(ctx.activeTool), <DrawToolGroup {...ctx.groupControls('draw')} />),
  },
  {
    id: 'text', priority: 50, dmOnly: true, available: isAtlasToolAvailable('text'),
    item: ctx => toolGroupItem(ctx, 'text', textToolFace(ctx.activeTool), <TextToolGroup {...ctx.groupControls('text')} />),
  },
  {
    id: 'measure', priority: 90, dmOnly: false, available: true,
    item: ctx => toolGroupItem(ctx, 'measure', measureToolFace(ctx.activeTool), <MeasureToolGroup {...ctx.groupControls('measure')} />),
  },
  {
    id: 'pin', priority: 70, dmOnly: true, available: true,
    item: ctx => buttonItem({
      icon: MapPin, label: "Note Pin Tool", shortcut: ctx.hotkeyLabel('pin'),
      isActive: ctx.activeTool === "note-pin", pinned: ctx.activeTool === "note-pin", onClick: () => ctx.selectTool("note-pin"),
    }),
  },
  {
    id: 'wall', priority: 40, dmOnly: true, available: WALLS_AND_LIGHTING_ENABLED,
    item: ctx => toolGroupItem(ctx, 'wall', wallToolFace(ctx.activeTool), <WallToolGroup {...ctx.groupControls('wall')} />),
  },
  {
    id: 'audio', priority: 35, dmOnly: true, available: AMBIENT_AUDIO_ENABLED,
    item: ctx => buttonItem({
      icon: Volume2, label: "Ambient Sound", shortcut: ctx.hotkeyLabel('audio'),
      isActive: ctx.activeTool === "audio", pinned: ctx.activeTool === "audio", onClick: () => ctx.selectTool("audio"),
    }),
  },
]
