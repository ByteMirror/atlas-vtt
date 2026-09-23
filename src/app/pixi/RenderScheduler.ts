import { UPDATE_PRIORITY, type Application, type RenderGroup } from 'pixi.js';

const schedulers = new WeakMap<Application, RenderScheduler>();

/**
 * Renders the stage only when it changed, instead of on every display frame.
 *
 * PIXI's `Application` redraws the whole stage on every tick, which kept the GPU busy
 * at the display's refresh rate while the map sat idle. The scheduler takes over that
 * ticker slot and reads PIXI's render-group bookkeeping (moved, added, removed or
 * hidden children and updated Graphics, Sprites or Text), which the next render
 * consumes anyway. Ticker callbacks such as animations keep running; whatever they
 * change on the stage is picked up the same way.
 *
 * Changes PIXI cannot see must call {@link requestRender}: pixels uploaded into an
 * existing texture (`source.update()`), hand-animated filter properties and renderer
 * settings such as the background colour.
 */
export class RenderScheduler {
  private renderRequested = true;
  private frameCount = 0;
  private readonly contextChangeListener = { contextChange: (): void => this.requestRender() };

  constructor(private readonly app: Application) {
    // The Application registered `render` with itself as context; that exact pair removes it
    const renderOwner: { readonly render: () => void } = app;
    app.ticker.remove(renderOwner.render, app);
    app.ticker.add(this.renderIfChanged, undefined, UPDATE_PRIORITY.LOW);
    // A restored WebGL context starts out blank
    app.renderer.runners.contextChange.add(this.contextChangeListener);
    schedulers.set(app, this);
  }

  /** Render on the next tick even if the stage looks unchanged. */
  public requestRender(): void {
    this.renderRequested = true;
  }

  /** How many times the stage has been rendered; lets canvas mirrors skip unchanged frames. */
  public get renderedFrames(): number {
    return this.frameCount;
  }

  public destroy(): void {
    this.app.ticker?.remove(this.renderIfChanged);
    this.app.renderer?.runners.contextChange.remove(this.contextChangeListener);
    schedulers.delete(this.app);
  }

  private readonly renderIfChanged = (): void => {
    const group = this.app.stage.renderGroup;
    if (!this.renderRequested && group && !hasPendingChanges(group)) return;
    this.renderRequested = false;
    this.app.render();
    this.frameCount++;
  };
}

/** Ask `app`'s scheduler for a render on the next tick. Does nothing for apps without one. */
export function requestRender(app: Application): void {
  schedulers.get(app)?.requestRender();
}

/** Stage renders of `app` so far, or undefined when it renders on every tick. */
export function getRenderedFrames(app: Application): number | undefined {
  return schedulers.get(app)?.renderedFrames;
}

/** Whether `group` or a nested render group holds updates that the next render would apply. */
export function hasPendingChanges(group: RenderGroup): boolean {
  if (group.structureDidChange || group.childrenRenderablesToUpdate.index > 0) return true;
  if (Object.values(group.childrenToUpdate).some((pending) => pending.index > 0)) return true;
  return group.renderGroupChildren.some(hasPendingChanges);
}
