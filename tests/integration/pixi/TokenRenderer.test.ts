import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Container,
  Point,
  Sprite,
  Texture,
  type Application,
  type EventSystem,
  type FederatedPointerEvent,
  type Ticker,
} from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { AssetService } from '../../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { computeTokenPixelSize } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

const GOBLIN_IMAGE = 'atlas-vtt/collections/default/tokens/goblin.png';
const ORC_IMAGE = 'atlas-vtt/collections/default/tokens/orc.png';

type ViewStore = ReturnType<typeof createViewAtlasStore>;
type TickerCallback = (ticker: Pick<Ticker, 'deltaMS'>) => void;
type TokenInput = Parameters<ReturnType<ViewStore['getState']>['addToken']>[0];

/** Records ticker callbacks so a test can advance animations frame by frame. */
class FakeTicker {
  private callbacks = new Set<TickerCallback>();
  add(callback: TickerCallback): void {
    this.callbacks.add(callback);
  }
  remove(callback: TickerCallback): void {
    this.callbacks.delete(callback);
  }
  advance(deltaMS: number): void {
    for (const callback of Array.from(this.callbacks)) callback({ deltaMS });
  }
  get size(): number {
    return this.callbacks.size;
  }
}

/** A left-button pointer event at screen position (x, y); the viewport is unzoomed, so screen = world. */
const pointerEvent = (x: number, y: number): FederatedPointerEvent =>
  ({
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    global: new Point(x, y),
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  }) as unknown as FederatedPointerEvent;

const token = (overrides: Partial<TokenInput> & { id: string }): TokenInput => ({
  x: 100,
  y: 100,
  size: 1,
  imagePath: GOBLIN_IMAGE,
  layer: 0,
  isHidden: false,
  rotation: 0,
  ...overrides,
});

describe('TokenRenderer Integration Tests', () => {
  let tokenRenderer: TokenRenderer;
  let viewport: Viewport;
  let store: ViewStore;
  let eventBus: EventEmitter;
  let ticker: FakeTicker;
  let gridSize: number;
  let selectionOverlayUpdater: ReturnType<typeof vi.fn>;
  let obsidianApp: ReturnType<typeof createInMemoryApp>['app'];
  let restoreGraphics: () => void;
  let viewportPointerDownListeners: number;
  let isRendererDestroyed: boolean;

  const gridSystem = {
    getOptions: () => ({ type: 'square', size: gridSize, offsetX: 0, offsetY: 0 }),
    snapToCellCenter: (x: number, y: number) => ({
      x: Math.floor(x / gridSize) * gridSize + gridSize / 2,
      y: Math.floor(y / gridSize) * gridSize + gridSize / 2,
    }),
  } as unknown as GridSystem;

  const createRenderer = (viewStore: ViewStore = store): TokenRenderer => {
    const renderer = new TokenRenderer(
      obsidianApp,
      viewport,
      gridSystem,
      selectionOverlayUpdater,
      viewStore,
      eventBus,
      'test-view-id',
    );
    renderer.setPixiApp({
      ticker,
      canvas: document.createElement('canvas'),
      renderer: { generateTexture: vi.fn(() => new Texture()) },
    } as unknown as Application);
    return renderer;
  };

  const tokenGroup = (id: string): Container => tokenRenderer.getTokenSprites()[id] as Container;
  const tokenSprite = (id: string): Sprite => tokenGroup(id).getChildByLabel('tokenSprite') as Sprite;
  const waitForTokens = (...ids: string[]): Promise<void> =>
    vi.waitFor(() => {
      for (const id of ids) expect(tokenGroup(id)).toBeInstanceOf(Container);
    });

  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
    (AssetService as unknown as { instance: AssetService | null }).instance = null;

    obsidianApp = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'goblin-bytes', [ORC_IMAGE]: 'orc-bytes' } }).app;
    // The viewport only needs the event system's DOM element to bind wheel/pointer listeners.
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
    viewportPointerDownListeners = viewport.listenerCount('pointerdown');
    store = createViewAtlasStore(obsidianApp, 'test-view-id');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/test.atlasmap');
    eventBus = new EventEmitter();
    ticker = new FakeTicker();
    gridSize = 70;
    selectionOverlayUpdater = vi.fn();

    tokenRenderer = createRenderer();
    isRendererDestroyed = false;
  });

  const destroyRenderer = (): void => {
    if (isRendererDestroyed) return;
    isRendererDestroyed = true;
    tokenRenderer.destroy();
  };

  afterEach(() => {
    destroyRenderer();
    viewport.destroy();
    restoreGraphics();
  });

  describe('Token Creation/Destruction', () => {
    it('should create tokens when added to store', async () => {
      store.getState().addToken(token({ id: 'token-1', ringColor: '#ff0000' }));
      await waitForTokens('token-1');

      const group = tokenGroup('token-1');
      expect(group.parent).toBe(tokenRenderer.getTokenContainer());
      expect(tokenRenderer.getTokenContainer().parent).toBe(viewport);
      expect(group.position).toMatchObject({ x: 100, y: 100 });
      expect(tokenSprite('token-1').texture.label).toBe(GOBLIN_IMAGE);
    });

    it('should destroy tokens when removed from store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');
      const group = tokenGroup('token-1');

      store.getState().deleteToken('token-1');

      await vi.waitFor(() => expect(tokenRenderer.getTokenSprites()['token-1']).toBeUndefined());
      expect(group.destroyed).toBe(true);
      expect(tokenRenderer.getTokenContainer().children).not.toContain(group);
    });

    it('should handle multiple tokens', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      store.getState().addToken(token({ id: 'token-2', x: 200, y: 200, size: 2, imagePath: ORC_IMAGE, rotation: 45 }));
      await waitForTokens('token-1', 'token-2');

      expect(Object.keys(tokenRenderer.getTokenSprites())).toHaveLength(2);
      expect(tokenSprite('token-2').texture.label).toBe(ORC_IMAGE);
      expect(tokenSprite('token-2').rotation).toBeCloseTo(Math.PI / 4);
      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(70, 1));
      expect(tokenSprite('token-2').width).toBeCloseTo(computeTokenPixelSize(70, 2));
    });
  });

  describe('Instance Badges', () => {
    const badgeOf = (id: string): Container | null => tokenGroup(id).getChildByLabel('instanceBadge');

    it('should number tokens spawned after the map loaded as soon as their sprites exist', async () => {
      // The first load redraws every badge once all sprites exist; later spawns must not depend on that.
      store.getState().addToken(token({ id: 'goblin-1' }));
      await waitForTokens('goblin-1');

      store.getState().addTokens([token({ id: 'goblin-2', x: 200 }), token({ id: 'goblin-3', x: 300 }), token({ id: 'orc', imagePath: ORC_IMAGE })]);
      await waitForTokens('goblin-2', 'goblin-3', 'orc');

      for (const id of ['goblin-1', 'goblin-2', 'goblin-3']) expect(badgeOf(id)?.visible).toBe(true);
      expect(badgeOf('orc')?.visible ?? false).toBe(false);
    });
  });

  describe('Sizing on Grid Change', () => {
    it('should update all token sizes when grid size changes', async () => {
      store.getState().addToken(token({ id: 'token-1', size: 2 }));
      await waitForTokens('token-1');
      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(70, 2));

      gridSize = 100;
      tokenRenderer.updateAllTokenSizes();

      expect(tokenSprite('token-1').width).toBeCloseTo(computeTokenPixelSize(100, 2));
      expect(tokenSprite('token-1').height).toBeCloseTo(computeTokenPixelSize(100, 2));
    });
  });

  describe('Ring Color Update', () => {
    it('should update ring color when token ringColor changes', async () => {
      store.getState().addToken(token({ id: 'token-1', ringColor: '#ff0000' }));
      await waitForTokens('token-1');
      const ringBefore = tokenGroup('token-1').getChildByLabel('tokenRing');
      expect(ringBefore).not.toBeNull();

      store.getState().updateToken('token-1', { ringColor: '#00ff00' });

      await vi.waitFor(() => {
        const ringAfter = tokenGroup('token-1').getChildByLabel('tokenRing');
        expect(ringAfter).not.toBeNull();
        expect(ringAfter).not.toBe(ringBefore);
      });
      expect(ringBefore?.destroyed).toBe(true);
    });
  });

  describe('Movement & Path Animation', () => {
    it('should move the sprite when the token position changes in the store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');

      store.getState().moveToken('token-1', 200, 240);

      await vi.waitFor(() => expect(tokenGroup('token-1').position).toMatchObject({ x: 200, y: 240 }));
    });

    it('should play back a recorded path and commit the final position to the store', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');

      eventBus.emit('animate-token-path', {
        tokenId: 'token-1',
        finalX: 300,
        finalY: 300,
        path: [
          { x: 150, y: 150, timestamp: 0 },
          { x: 250, y: 250, timestamp: 500 },
        ],
        duration: 1000,
      });
      expect(ticker.size).toBe(1);

      ticker.advance(400);
      const midway = tokenGroup('token-1').position;
      expect(midway.x).toBeGreaterThan(100);
      expect(midway.x).toBeLessThan(300);
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 100, y: 100 });

      ticker.advance(400);
      expect(tokenGroup('token-1').position).toMatchObject({ x: 300, y: 300 });
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 300, y: 300 });
      expect(ticker.size).toBe(0);
    });
  });

  describe('Selection & Drag', () => {
    it('should select a token on pointer down, drag it and commit the snapped position as one undo step', async () => {
      store.getState().addToken(token({ id: 'token-1', x: 105, y: 105 }));
      await waitForTokens('token-1');
      expect(tokenRenderer.hitTestTokens(105, 105)).toBe('token-1');
      expect(tokenRenderer.hitTestTokens(900, 900)).toBeNull();
      const undoStepsBefore = getHistoryStore(store)!.getState().pastStates.length;

      viewport.emit('pointerdown', pointerEvent(105, 105));
      expect(store.getState().selectedIds).toEqual(['token-1']);

      viewport.emit('pointermove', pointerEvent(180, 105));
      expect(tokenGroup('token-1').position).toMatchObject({ x: 180, y: 105 });
      expect(store.getState().isDragging).toBe(true);

      viewport.emit('pointerup', pointerEvent(180, 105));

      // 180 lies in the third 70px cell, whose centre is 175.
      expect(store.getState().objects.tokens['token-1']).toMatchObject({ x: 175, y: 105 });
      expect(tokenGroup('token-1').position).toMatchObject({ x: 175, y: 105 });
      expect(store.getState().isDragging).toBe(false);
      expect(selectionOverlayUpdater).toHaveBeenCalled();
      expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(undoStepsBefore + 1);
    });
  });

  describe('Token Visibility', () => {
    it('should show hidden tokens dimmed to the GM', async () => {
      store.getState().addToken(token({ id: 'token-1', isHidden: true }));
      await waitForTokens('token-1');

      expect(tokenGroup('token-1').visible).toBe(true);
      expect(tokenGroup('token-1').alpha).toBe(0.5);
    });

    it('should show tokens when isHidden is false', async () => {
      store.getState().addToken(token({ id: 'token-1', isHidden: false }));
      await waitForTokens('token-1');

      expect(tokenGroup('token-1').visible).toBe(true);
      expect(tokenGroup('token-1').alpha).toBe(1);
    });

    // The player window mirrors this canvas, so the DM previewing the player
    // perspective must see exactly what players get.
    describe('player perspective', () => {
      it('should hide hidden tokens added while the DM previews the player perspective', async () => {
        store.getState().setGMView(false);
        store.getState().addToken(token({ id: 'token-1', isHidden: true }));
        await waitForTokens('token-1');

        expect(tokenGroup('token-1').visible).toBe(false);
      });

      it('should hide already rendered hidden tokens when the DM switches to the player perspective', async () => {
        store.getState().addToken(token({ id: 'token-1', isHidden: true }));
        await waitForTokens('token-1');

        store.getState().setGMView(false);

        await vi.waitFor(() => expect(tokenGroup('token-1').visible).toBe(false));
      });

      it('should keep regular tokens with vault images visible in the player perspective', async () => {
        store.getState().setGMView(false);
        store.getState().addToken(token({ id: 'token-1', isHidden: false }));
        await waitForTokens('token-1');

        expect(tokenGroup('token-1').visible).toBe(true);
      });
    });
  });

  describe('Cleanup', () => {
    it('should properly clean up when destroyed', async () => {
      store.getState().addToken(token({ id: 'token-1' }));
      await waitForTokens('token-1');
      const group = tokenGroup('token-1');
      const container = tokenRenderer.getTokenContainer();

      expect(viewport.listenerCount('pointerdown')).toBeGreaterThan(viewportPointerDownListeners);

      destroyRenderer();

      expect(group.destroyed).toBe(true);
      expect(container.destroyed).toBe(true);
      expect(viewport.listenerCount('pointerdown')).toBe(viewportPointerDownListeners);

      // A destroyed renderer must not react to the store any more.
      store.getState().addToken(token({ id: 'token-2' }));
      expect(tokenRenderer.getTokenSprites()).toEqual({});
    });
  });
});
