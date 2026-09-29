import { useCallback } from "react"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"

/** Emits on the map view's event bus, where the tools and renderers pick up toolbar settings. */
export function useEmitViewEvent(): (event: string, payload?: unknown) => void {
  const { view } = useAtlasUI()
  return useCallback((event: string, payload?: unknown): void => {
    view?.serviceManager?.getEventBus?.()?.emit(event, payload)
  }, [view])
}
