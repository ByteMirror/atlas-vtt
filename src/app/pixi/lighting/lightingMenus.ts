import type { ViewAtlasStore } from '../../storeFactory';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { WallInteraction } from '../vision/WallInteraction';
import type { WallRenderer } from '../vision/WallRenderer';
import { t } from '../../i18n';

export interface LightingMenuContext {
  store: ViewAtlasStore;
  walls: WallInteraction;
  wallRenderer: WallRenderer;
  /** Opens the light's settings next to the given screen point. */
  configureLight: (lightId: string, screenX: number, screenY: number) => void;
}

export function showLightMenu(context: LightingMenuContext, lightId: string, screenX: number, screenY: number): void {
  const light = context.store.getState().objects.lights[lightId];
  if (!light) return;
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: t('light.configure'), icon: 'settings', onClick: () => context.configureLight(lightId, screenX, screenY) },
    {
      type: 'item',
      label: light.hidden ? t('light.turnOn') : t('light.turnOff'),
      icon: light.hidden ? 'lightbulb' : 'lightbulb-off',
      onClick: () => context.store.getState().updateLight(lightId, { hidden: !light.hidden }),
    },
    { type: 'item', label: t('light.delete'), icon: 'trash-2', onClick: () => context.store.getState().deleteLight(lightId) },
  ];
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}

/** The wall tool's context menu: a light under the pointer, else the wall selection. */
export function showWallMenu(context: LightingMenuContext, worldX: number, worldY: number, screenX: number, screenY: number): void {
  const { walls, wallRenderer, store } = context;
  const lightId = wallRenderer.hitTestLights(worldX, worldY);
  if (lightId) {
    showLightMenu(context, lightId, screenX, screenY);
    return;
  }

  // A right-click on an unselected wall selects it first
  const hitWallId = wallRenderer.hitTestWalls(worldX, worldY) ?? wallRenderer.hitTestVertices(worldX, worldY)?.wallId;
  if (hitWallId && !walls.getSelectedWallIds().includes(hitWallId)) walls.handlePointerDown(worldX, worldY, false);
  if (!walls.hasSelection()) return;

  const selected = walls.getSelectedWallIds();
  const allWalls = store.getState().objects.walls;
  const directions = new Set(selected.map((id) => allWalls[id]?.direction ?? 'both'));
  const single = selected.length === 1 ? allWalls[selected[0]!] : undefined;
  const entries: ContextMenuEntry[] = [];

  if (single?.type === 'solid') {
    entries.push(
      { type: 'item', label: t('wall.placeDoor'), icon: 'door-open', onClick: () => walls.startDoorPlacement(single.id, 'door') },
      { type: 'item', label: t('wall.placeSecretDoor'), icon: 'lock', onClick: () => walls.startDoorPlacement(single.id, 'secret-door') },
    );
  }

  const direction = (label: string, value: 'left' | 'right' | undefined): ContextMenuEntry => ({
    type: 'item',
    label,
    checked: directions.size === 1 && directions.has(value ?? 'both'),
    onClick: () => walls.setSelectedDirection(value),
  });
  entries.push({
    type: 'submenu',
    label: t('wall.direction'),
    icon: 'arrow-left-right',
    children: [direction(t('wall.blockBoth'), undefined), direction(t('wall.allowLeft'), 'left'), direction(t('wall.allowRight'), 'right')],
  });

  entries.push({
    type: 'item',
    label: selected.length > 1 ? t('wall.deleteMany', { count: selected.length }) : t('common.delete'),
    icon: 'trash-2',
    onClick: () => walls.deleteSelected(),
  });
  openContextMenuGlobal(entries, { x: screenX, y: screenY });
}
