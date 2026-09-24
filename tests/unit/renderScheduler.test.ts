import { describe, expect, it, vi } from 'vitest';
import { Container, Ticker, type Application, type RenderGroup } from 'pixi.js';
import { RenderScheduler, getRenderedFrames, hasPendingChanges, requestRender } from '../../src/app/pixi/RenderScheduler';

interface GroupState {
  structureDidChange?: boolean;
  renderables?: number;
  updates?: number;
  children?: RenderGroup[];
}

function fakeGroup({ structureDidChange = false, renderables = 0, updates = 0, children = [] }: GroupState = {}): RenderGroup {
  return {
    structureDidChange,
    childrenRenderablesToUpdate: { list: [], index: renderables },
    childrenToUpdate: { 1: { list: [], index: updates } },
    renderGroupChildren: children,
  } as unknown as RenderGroup;
}

function fakeApp(group: RenderGroup): { app: Application; render: ReturnType<typeof vi.fn>; ticker: Ticker } {
  const ticker = new Ticker();
  ticker.autoStart = false;
  const render = vi.fn();
  const stage = new Container();
  Object.defineProperty(stage, 'renderGroup', { value: group });
  const app = {
    ticker,
    stage,
    render,
    renderer: { runners: { contextChange: { add: vi.fn(), remove: vi.fn() } } },
  } as unknown as Application;
  // What Application's TickerPlugin does on init
  ticker.add(app.render, app);
  return { app, render, ticker };
}

describe('hasPendingChanges', () => {
  it('is false for a render group without queued updates', () => {
    expect(hasPendingChanges(fakeGroup())).toBe(false);
  });

  it.each<[string, GroupState]>([
    ['a structure change', { structureDidChange: true }],
    ['an updated Graphics, Sprite or Text', { renderables: 1 }],
    ['a moved or restyled container', { updates: 1 }],
    ['a change inside a nested render group', { children: [fakeGroup({ updates: 2 })] }],
  ])('is true for %s', (_, state) => {
    expect(hasPendingChanges(fakeGroup(state))).toBe(true);
  });
});

describe('RenderScheduler', () => {
  it('replaces the per-tick render with a render only when the stage changed', () => {
    const group = fakeGroup();
    const { app, render, ticker } = fakeApp(group);
    const scheduler = new RenderScheduler(app);

    ticker.update(16);
    expect(render).toHaveBeenCalledTimes(1);
    ticker.update(32);
    ticker.update(48);
    expect(render).toHaveBeenCalledTimes(1);

    group.structureDidChange = true;
    ticker.update(64);
    expect(render).toHaveBeenCalledTimes(2);
    expect(scheduler.renderedFrames).toBe(2);
    expect(getRenderedFrames(app)).toBe(2);
    scheduler.destroy();
  });

  it('renders once on request for changes the scene graph cannot see', () => {
    const { app, render, ticker } = fakeApp(fakeGroup());
    const scheduler = new RenderScheduler(app);
    ticker.update(16);
    render.mockClear();

    requestRender(app);
    ticker.update(32);
    ticker.update(48);

    expect(render).toHaveBeenCalledTimes(1);
    scheduler.destroy();
  });

  it('stops rendering after destroy', () => {
    const group = fakeGroup({ structureDidChange: true });
    const { app, render, ticker } = fakeApp(group);
    new RenderScheduler(app).destroy();

    ticker.update(16);

    expect(render).not.toHaveBeenCalled();
    expect(getRenderedFrames(app)).toBeUndefined();
  });
});
