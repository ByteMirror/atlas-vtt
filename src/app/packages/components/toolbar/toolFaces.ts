import type React from "react"
import { BrickWall, Circle, Cloud, Eraser, Flashlight, Hand, Pencil, Ruler, Stamp, Triangle, Type } from "lucide-react"
import type { AtlasState } from "../../../atlasStore"

export type Tool = AtlasState["activeTool"]

/**
 * What a tool family's toolbar button shows and selects: the family member in
 * use, or the family's main tool when another family is active. The bar's
 * button and its entry in the overflow menu both read it.
 */
export interface ToolFace {
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** The tool a click selects. */
  tool: Tool
  isActive: boolean
}

/** The shape the measure renderer draws for each measure tool. */
export const MEASURE_SHAPES = { "measure": "line", "measure-circle": "circle", "measure-cone": "cone" } as const

export type MeasureTool = keyof typeof MEASURE_SHAPES

export const MEASURE_TOOLS: readonly MeasureTool[] = ["measure", "measure-circle", "measure-cone"]

export function isMeasureTool(tool: Tool): tool is MeasureTool {
  return tool in MEASURE_SHAPES
}

export function moveToolFace(activeTool: Tool): ToolFace {
  const laser = activeTool === "laser-pointer"
  return {
    icon: laser ? Flashlight : Hand,
    label: laser ? "Laser Pointer" : "Move/Select",
    tool: laser ? "laser-pointer" : "move",
    isActive: laser || activeTool === "move",
  }
}

export function fogToolFace(activeTool: Tool): ToolFace {
  const eraser = activeTool === "eraser"
  return {
    icon: eraser ? Eraser : Cloud,
    label: eraser ? "Fog Eraser" : "Fog Tool",
    tool: eraser ? "eraser" : "fog",
    isActive: eraser || activeTool === "fog",
  }
}

export function drawToolFace(activeTool: Tool): ToolFace {
  if (activeTool === "draw-eraser") return { icon: Eraser, label: "Drawing Eraser", tool: activeTool, isActive: true }
  if (activeTool === "draw-icon") return { icon: Stamp, label: "Icon Stamp", tool: activeTool, isActive: true }
  return { icon: Pencil, label: "Draw Tool", tool: "draw-pen", isActive: activeTool === "draw-pen" }
}

export function measureToolFace(activeTool: Tool): ToolFace {
  if (activeTool === "measure-circle") return { icon: Circle, label: "Measure Circle", tool: activeTool, isActive: true }
  if (activeTool === "measure-cone") return { icon: Triangle, label: "Measure Cone", tool: activeTool, isActive: true }
  return { icon: Ruler, label: "Measure Line", tool: "measure", isActive: activeTool === "measure" }
}

/** Face of a tool without family members. */
export function singleToolFace(tool: Tool, icon: ToolFace["icon"], label: string, activeTool: Tool): ToolFace {
  return { icon, label, tool, isActive: activeTool === tool }
}

export function textToolFace(activeTool: Tool): ToolFace {
  return singleToolFace("text", Type, "Text Tool", activeTool)
}

export function wallToolFace(activeTool: Tool): ToolFace {
  return singleToolFace("wall", BrickWall, "Walls & Lighting", activeTool)
}
