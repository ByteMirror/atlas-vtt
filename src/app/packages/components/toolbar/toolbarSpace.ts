import { createContext } from "react"

/**
 * Width in px the main toolbar may take, from the bottom row it sits in; null
 * while nothing constrains it (outside the row, or before the row is laid out).
 */
export const ToolbarSpaceContext = createContext<number | null>(null)
