import { LIMITED_WALLS } from '../../featureFlags';
import { readLight, readWall } from '../../lighting/lightingObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import type { WallChannel } from '../../types/wallTypes';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { WallInteraction } from '../vision/WallInteraction';
import type { WallRenderer } from '../vision/WallRenderer';

export interface LightingMenuContext {
  store: ViewAtlasStore;
  walls: WallInteraction;
  wallRenderer: WallRenderer;
  /** The light whose marker is at the world point. */
  lightAt: (worldX: number, worldY: number) => string | null;
}

export function showLightMenu(context: LightingMenuContext, lightId: string, screenX: number, screenY: number): void {
  const light = readLight(context.store.getState().objects.lights[lightId]);
  if (!light) return;
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: 'Configure light…', icon: 'settings', onClick: () => context.store.getState().openLightPopover(lightId) },
    {
      type: 'item',
      label: light.hidden ? 'Turn on' : 'Turn off',
      icon: light.hidden ? 'lightbulb' : 'lightbulb-off',
      onClick: () => context.store.getState().updateLight(lightId, { hidden: !light.hidden }),
    },
    { type: 'item', label: 'Delete light', icon: 'trash-2', onClick: () => context.store.getState().deleteLight(lightId) },
  ];
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** What a door offers: to open or close it, and to lock it; a locked door only to unlock it. Nothing for a wall that is no door. */
export function doorMenuEntries(store: ViewAtlasStore, wallId: string): ContextMenuEntry[] {
  const wall = readWall(store.getState().objects.walls[wallId]);
  if (!wall || (wall.type !== 'door' && wall.type !== 'secret-door')) return [];
  if (wall.locked) return [{ type: 'item', label: 'Unlock door', icon: 'lock-open', onClick: () => store.getState().setDoorLocked(wallId, false) }];
  const closed = wall.closed ?? true;
  return [
    { type: 'item', label: closed ? 'Open door' : 'Close door', icon: closed ? 'door-open' : 'door-closed', onClick: () => store.getState().toggleDoor(wallId) },
    { type: 'item', label: 'Lock door', icon: 'lock', onClick: () => store.getState().setDoorLocked(wallId, true) },
  ];
}

/** A door badge's context menu, with any tool. */
export function showDoorMenu(store: ViewAtlasStore, wallId: string, screenX: number, screenY: number): void {
  const entries = doorMenuEntries(store, wallId);
  if (entries.length > 0) openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** The wall tool's context menu: a light under the pointer, else the wall selection. */
export function showWallMenu(context: LightingMenuContext, worldX: number, worldY: number, screenX: number, screenY: number): void {
  const { walls, wallRenderer, store } = context;
  const lightId = context.lightAt(worldX, worldY);
  if (lightId) {
    showLightMenu(context, lightId, screenX, screenY);
    return;
  }

  // A right-click on an unselected wall selects it first, alone. Not as a press would: that opens a door, and takes hold of a wall's end.
  const hitWallId = wallRenderer.hitTestWalls(worldX, worldY) ?? wallRenderer.hitTestVertices(worldX, worldY)?.wallId;
  if (hitWallId && !walls.getSelectedWallIds().includes(hitWallId)) walls.selectWallChain(hitWallId, false);
  if (!walls.hasSelection()) return;

  const selected = walls.getSelectedWallIds();
  const allWalls = store.getState().objects.walls;
  const directions = new Set(selected.map((id) => allWalls[id]?.direction ?? 'both'));
  const single = selected.length === 1 ? allWalls[selected[0]!] : undefined;
  const entries: ContextMenuEntry[] = [];

  if (single?.type === 'solid') {
    entries.push(
      { type: 'item', label: 'Place door', icon: 'door-open', onClick: () => walls.startDoorPlacement(single.id, 'door') },
      { type: 'item', label: 'Place secret door', icon: 'lock', onClick: () => walls.startDoorPlacement(single.id, 'secret-door') },
    );
  }

  if (single) entries.push(...doorMenuEntries(store, single.id));

  const direction = (label: string, value: 'left' | 'right' | undefined): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: directions.size === 1 && directions.has(value ?? 'both'),
    onClick: () => walls.updateSelected({ direction: value }),
  });
  entries.push({
    type: 'submenu',
    label: 'Light direction',
    icon: 'arrow-left-right',
    children: [direction('Block both sides', undefined), direction('Allow from left', 'left'), direction('Allow from right', 'right')],
  });

  // What the selected walls block, as they are read (a kind that is none reads as both).
  const kinds = new Set(selected.map((id) => readWall(allWalls[id])?.blocks ?? 'both'));
  const blocks = (label: string, value: WallChannel | undefined): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: kinds.size === 1 && kinds.has(value ?? 'both'),
    onClick: () => walls.updateSelected({ blocks: value }),
  });
  entries.push({
    type: 'submenu',
    label: 'Blocks',
    icon: 'eye-off',
    children: [blocks('Sight and light', undefined), blocks('Sight only', 'sight'), blocks('Light only', 'light')],
  });
  // A hedge or a low wall: on while every selected wall is limited, and then takes it from all of them.
  if (LIMITED_WALLS) {
    const allLimited = selected.every((id) => readWall(allWalls[id])?.limited);
    entries.push({ type: 'item', label: 'Limited (see past the first)', icon: 'grip-horizontal', checked: allLimited, onClick: () => walls.updateSelected({ limited: allLimited ? undefined : true }) });
  }

  entries.push({
    type: 'item',
    label: selected.length > 1 ? `Delete (${selected.length} walls)` : 'Delete',
    icon: 'trash-2',
    onClick: () => walls.deleteSelected(),
  });
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}
