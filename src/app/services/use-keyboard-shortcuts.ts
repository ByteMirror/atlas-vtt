"use client"

import { useEffect, useRef } from "react"

type ShortcutHandler = (event: KeyboardEvent) => void

interface ShortcutMap {
  [key: string]: ShortcutHandler
}

function getShortcutHandler(shortcuts: ShortcutMap, event: KeyboardEvent): ShortcutHandler | undefined {
  const lowerKey = event.key.toLowerCase()
  return shortcuts[lowerKey] ?? shortcuts[event.key]
}

function isActiveShortcutTarget(container: HTMLElement | null): boolean {
  if (container) {
    const workspaceLeaf = container.closest('.workspace-leaf')
    return workspaceLeaf?.classList.contains('mod-active') === true
  }

  const activeLeaf = document.querySelector('.workspace-leaf.mod-active')
  if (!activeLeaf) {
    return false
  }

  return (
    activeLeaf.querySelector('.atlas-react-ui-container') !== null ||
    activeLeaf.querySelector('#atlas-pixi-canvas-debug') !== null ||
    activeLeaf.querySelector('.view-content[data-type="atlas-vtt"]') !== null
  )
}

/**
 * Check if keyboard shortcuts should be blocked based on current focus
 */
function shouldBlockShortcuts(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement
  
  // Block if typing in an input field
  if (target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' || 
      target.tagName === 'SELECT' ||
      target.isContentEditable) {
    return true
  }
  
  // Block if Obsidian command palette is open (Cmd/Ctrl + P)
  const commandPalette = document.querySelector('.prompt') || 
                        document.querySelector('.suggestion-container')
  if (commandPalette) {
    return true
  }
  
  // Block if any modal is open
  const modal = document.querySelector('.modal-container')
  if (modal) {
    return true
  }
  
  return false
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap, viewId?: string) {
  const containerRef = useRef<HTMLElement | null>(null)
  const shortcutsRef = useRef<ShortcutMap>(shortcuts)

  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])
  
  useEffect(() => {
    // Find this specific view's container
    if (viewId) {
      const viewContainer = document.querySelector(`[data-view-id="${viewId}"]`)
      if (viewContainer) {
        containerRef.current = viewContainer as HTMLElement
      }
    } else {
      containerRef.current = null
    }
  }, [viewId])
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Fast-path exit for unrelated keys to avoid expensive DOM queries on every key press.
      const handler = getShortcutHandler(shortcutsRef.current, event)
      if (!handler) {
        return
      }

      // Check if shortcuts should be blocked
      if (shouldBlockShortcuts(event)) {
        return
      }
      
      if (viewId && !containerRef.current) {
        const viewContainer = document.querySelector(`[data-view-id="${viewId}"]`)
        if (viewContainer) {
          containerRef.current = viewContainer as HTMLElement
        }
      }

      if (!isActiveShortcutTarget(containerRef.current)) {
        return
      }

      handler(event)
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [viewId])
}
