import { App as ObsidianApp } from 'obsidian';
import type { TokenAsset, AnyAsset, EncounterAsset } from '../types';
import { loadStatblockOverrides, type StatblockOverrides } from './statblockLoader';
import type { AssetService } from '../../../../services/AssetService';
import {
  FALLBACK_PITCH,
  cellPitch,
  formationGridFromOptions,
  placeFormation,
  type FormationGrid,
  type FormationSlot,
} from '../../../../encounters/encounterFormation';
import type { AtlasView } from '../../../../atlas-view';
import type { TokenInput, ViewAtlasState } from '../../../../storeFactory';

// ─── Viewport helpers ───────────────────────────────────────────────

interface ViewportLike {
  screenWidth: number;
  screenHeight: number;
  toWorld(point: { x: number; y: number }): { x: number; y: number };
  x?: number;
  y?: number;
  scale: { x: number };
  getVisibleBounds?(): { left: number; right: number; top: number; bottom: number };
  animate?(opts: { position: { x: number; y: number }; scale: number; time: number }): void;
}

interface GridSystemLike {
  getOptions(): { type?: string; size: number; offsetX?: number; offsetY?: number; enabled?: boolean };
  snapToCellCenter(x: number, y: number): { x: number; y: number };
}

export interface SpawnContext {
  app: ObsidianApp;
  view: AtlasView | null;
  addTokens: ViewAtlasState['addTokens'];
  setSelection: (ids: string[]) => void;
  assetService: AssetService | null;
}

interface SpawnTarget {
  viewport: ViewportLike;
  gridSystem: GridSystemLike | null;
  /** Grid geometry for formation placement; null when the grid is off or unusable. */
  grid: FormationGrid | null;
  /** Spacing between spawned tokens. */
  pitch: number;
}

function getSpawnTarget(view: AtlasView | null): SpawnTarget | null {
  const serviceManager = view?.serviceManager;
  const rendererService = serviceManager?.getRendererService();
  const viewport = rendererService?.getViewport() as ViewportLike | undefined;
  const gridSystem = (rendererService?.getGridSystem() as GridSystemLike | undefined) ?? null;

  if (!viewport) return null;
  const grid = formationGridFromOptions(gridSystem?.getOptions());
  return { viewport, gridSystem, grid, pitch: grid ? cellPitch(grid) : FALLBACK_PITCH };
}

function getViewportCenter(viewport: ViewportLike): { x: number; y: number } {
  try {
    const centerScreen = { x: viewport.screenWidth / 2, y: viewport.screenHeight / 2 };
    return viewport.toWorld(centerScreen);
  } catch {
    return { x: viewport.x || 0, y: viewport.y || 0 };
  }
}

// ─── Grid layout helper ─────────────────────────────────────────────

function gridPosition(
  index: number,
  total: number,
  centerX: number,
  centerY: number,
  cellSize: number,
  gridSystem: GridSystemLike | null
): { x: number; y: number } {
  const tokensPerRow = Math.ceil(Math.sqrt(total));
  const totalRows = Math.ceil(total / tokensPerRow);
  const row = Math.floor(index / tokensPerRow);
  const col = index % tokensPerRow;

  let x = centerX + (col - (tokensPerRow - 1) / 2) * cellSize;
  let y = centerY + (row - (totalRows - 1) / 2) * cellSize;

  if (gridSystem) {
    const snapped = gridSystem.snapToCellCenter(x, y);
    x = snapped.x;
    y = snapped.y;
  }

  return { x, y };
}

/** Formation slots for an encounter, or null if any token lacks captured layout data. */
function encounterSlots(encounter: EncounterAsset): FormationSlot[] | null {
  if (!encounter.formation) return null;
  const slots: FormationSlot[] = [];
  for (const token of encounter.tokens ?? []) {
    if (!token.cell || !token.offset) return null;
    slots.push({ cell: token.cell, offset: token.offset });
  }
  return slots;
}

// ─── Build token data ───────────────────────────────────────────────

interface TokenSpawnData extends Omit<StatblockOverrides, 'hp'> {
  x: number;
  y: number;
  imagePath: string;
  kind: 'character';
  name: string;
  hp?: number | { current: number; max: number };
  statblockPath?: string;
  stress?: number;
  maxStress?: number;
  difficulty?: string;
  size?: number;
  showRing?: boolean;
}

/** What a spawned token inherits from its asset. */
interface TokenSource {
  imagePath: string;
  name: string;
  statblockPath: string | null;
  size?: number | undefined;
  showRing?: boolean | undefined;
}

/** Fields an asset-manager view model or stored token reference may carry. */
interface TokenSourceRef {
  id?: string;
  name?: string;
  imagePath?: string;
  imageUrl?: string;
  statblockPath?: string;
  size?: number;
  showRing?: boolean;
}

/** Latest service record for the asset layered over the reference, so spawns use current paths and defaults. */
async function resolveTokenSource(ctx: SpawnContext, ref: TokenSourceRef): Promise<TokenSource | null> {
  const latest = ctx.assetService && ref.id ? await ctx.assetService.getAssetById(ref.id) : null;
  const record = latest?.type === 'token' ? latest : null;
  const imagePath = record?.imagePath ?? ref.imagePath ?? ref.imageUrl;
  if (!imagePath) {
    console.error('[tokenSpawnService] Token asset missing imagePath:', ref);
    return null;
  }
  return {
    imagePath,
    name: ref.name || 'Token',
    statblockPath: record?.statblockPath ?? ref.statblockPath ?? null,
    size: record?.size ?? ref.size,
    showRing: record?.showRing ?? ref.showRing,
  };
}

async function buildTokenData(
  app: ObsidianApp,
  pos: { x: number; y: number },
  { imagePath, name, statblockPath, size, showRing }: TokenSource
): Promise<TokenSpawnData> {
  const data: TokenSpawnData = {
    x: pos.x,
    y: pos.y,
    imagePath,
    kind: 'character',
    name,
  };

  if (size !== undefined) data.size = size;
  if (showRing !== undefined) data.showRing = showRing;

  if (statblockPath) {
    data.statblockPath = statblockPath;
    const overrides = await loadStatblockOverrides(app, statblockPath);
    Object.assign(data, overrides);
  }

  return data;
}

function imageExists(app: ObsidianApp, imagePath: string): boolean {
  if (app.vault.getAbstractFileByPath(imagePath)) return true;
  console.error(`[tokenSpawnService] Token image not found: ${imagePath}`);
  return false;
}

/** Adds the tokens in one store write (a single undo step) and selects them. */
function addSpawnedTokens(ctx: SpawnContext, tokens: TokenInput[]): string[] {
  const ids = ctx.addTokens(tokens);
  if (ids.length > 0) ctx.setSelection(ids);
  return ids;
}

// ─── Public spawn functions ─────────────────────────────────────────

/**
 * Spawn one or more copies of a single token asset on the map.
 */
export async function spawnTokenAsset(
  ctx: SpawnContext,
  asset: TokenAsset,
  count: number
): Promise<string[]> {
  const target = getSpawnTarget(ctx.view);
  if (!target) {
    console.error('[tokenSpawnService] No renderer or viewport available');
    return [];
  }
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const source = await resolveTokenSource(ctx, asset);
  if (!source) return [];

  // The statblock is read once; every copy shares that data at its own position.
  const template = await buildTokenData(ctx.app, center, source);
  const tokens = Array.from({ length: count }, (_, i): TokenInput => ({
    ...structuredClone(template),
    ...gridPosition(i, count, center.x, center.y, pitch, gridSystem),
  }));
  return addSpawnedTokens(ctx, tokens);
}

/**
 * Spawn all tokens from an encounter asset.
 */
export async function spawnEncounterTokens(
  ctx: SpawnContext,
  encounter: EncounterAsset
): Promise<string[]> {
  const target = getSpawnTarget(ctx.view);
  if (!target) {
    console.error('[tokenSpawnService] No renderer or viewport available');
    return [];
  }
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const tokensToSpawn = encounter.tokens || [];

  const slots = encounterSlots(encounter);
  const formationPositions = slots && encounter.formation
    ? placeFormation(slots, encounter.formation, center, grid)
    : null;

  const tokens: TokenInput[] = [];
  for (let i = 0; i < tokensToSpawn.length; i++) {
    const token = tokensToSpawn[i];
    if (!token) continue;

    // Captured formation → legacy absolute offsets → generic grid layout
    let pos: { x: number; y: number };
    const formationPos = formationPositions?.[i];
    if (formationPos) {
      pos = formationPos;
    } else if (token.x !== undefined && token.y !== undefined) {
      let x = center.x + token.x;
      let y = center.y + token.y;
      if (gridSystem) {
        const snapped = gridSystem.snapToCellCenter(x, y);
        x = snapped.x;
        y = snapped.y;
      }
      pos = { x, y };
    } else {
      pos = gridPosition(i, tokensToSpawn.length, center.x, center.y, pitch, gridSystem);
    }

    // A saved state snapshot is restored verbatim. Encounters built from token
    // assets rebuild from the asset, so they follow its current image, size and ring.
    if (token.state) {
      if (imageExists(ctx.app, token.imagePath)) {
        tokens.push({ ...token.state, imagePath: token.imagePath, x: pos.x, y: pos.y });
      }
      continue;
    }
    const source = await resolveTokenSource(ctx, token);
    if (source && imageExists(ctx.app, source.imagePath)) {
      tokens.push(await buildTokenData(ctx.app, pos, source));
    }
  }

  return addSpawnedTokens(ctx, tokens);
}

/**
 * Spawn multiple selected token assets (from context menu "Spawn N tokens on map").
 */
export async function spawnSelectedTokens(
  ctx: SpawnContext,
  selectedAssets: AnyAsset[]
): Promise<string[]> {
  const target = getSpawnTarget(ctx.view);
  if (!target) {
    console.error('[tokenSpawnService] No renderer or viewport available');
    return [];
  }
  const { viewport, grid, pitch } = target;
  const gridSystem = grid ? target.gridSystem : null;
  const center = getViewportCenter(viewport);
  const tokensToSpawn = selectedAssets.filter(a => a.type === 'tokens');

  const tokens: TokenInput[] = [];
  for (let i = 0; i < tokensToSpawn.length; i++) {
    const tokenAsset = tokensToSpawn[i];
    if (!tokenAsset) continue;

    const source = await resolveTokenSource(ctx, tokenAsset);
    if (!source) continue;
    const pos = gridPosition(i, tokensToSpawn.length, center.x, center.y, pitch, gridSystem);
    tokens.push(await buildTokenData(ctx.app, pos, source));
  }

  return addSpawnedTokens(ctx, tokens);
}
