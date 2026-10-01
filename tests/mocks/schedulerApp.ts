import { vi } from 'vitest';
import { Container, Ticker, type Application, type RenderGroup } from 'pixi.js';

export interface GroupState {
  structureDidChange?: boolean;
  renderables?: number;
  updates?: number;
  children?: RenderGroup[];
}

/** A render group holding only the bookkeeping `hasPendingChanges` reads. */
export function fakeGroup({ structureDidChange = false, renderables = 0, updates = 0, children = [] }: GroupState = {}): RenderGroup {
  return {
    structureDidChange,
    childrenRenderablesToUpdate: { list: [], index: renderables },
    childrenToUpdate: { 1: { list: [], index: updates } },
    renderGroupChildren: children,
  } as unknown as RenderGroup;
}

/** An Application as `RenderScheduler` sees it: a hand-stepped ticker, a stage with `group` and `render`. */
export function fakeApp(group: RenderGroup, render: () => void = vi.fn()): { app: Application; render: () => void; ticker: Ticker } {
  const ticker = new Ticker();
  ticker.autoStart = false;
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
