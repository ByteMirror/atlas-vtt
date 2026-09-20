import type { Command, Plugin } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {} }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: {} }));
vi.mock('../../src/app/plugin/cleanupMissingAssets', () => ({ cleanupMissingAssets: vi.fn() }));
vi.mock('../../src/app/plugin/createMapFromImage', () => ({ promptNewMapFromImage: vi.fn() }));
vi.mock('../../src/app/plugin/imageOptimizationFlows', () => ({ optimizeFolderImages: vi.fn(), optimizeVaultImages: vi.fn() }));

import { registerCommands, type CommandDependencies } from '../../src/app/plugin/registerCommands';

describe('Obsidian panel toggle commands', () => {
  it.each([
    ['toggle-initiative-tracker', 'initiativeTrackerOpen'],
    ['toggle-dice-log', 'isDiceLogOpen'],
  ] as const)('%s checks availability without mutation and toggles only the active view', (id, field) => {
    const makeView = () => {
      const state = {
        initiativeTrackerOpen: false,
        isDiceLogOpen: false,
        setInitiativeTrackerOpen: (open: boolean) => { state.initiativeTrackerOpen = open; },
        setDiceLogOpen: (open: boolean) => { state.isDiceLogOpen = open; },
      };
      return { getStore: () => ({ getState: () => state }) };
    };
    const first = makeView();
    const second = makeView();
    let activeView: ReturnType<typeof makeView> | null = first;
    const commands: Command[] = [];
    const plugin = {
      app: { workspace: { getActiveViewOfType: () => activeView } },
      addCommand: (command: Command) => commands.push(command),
      addRibbonIcon: vi.fn(),
    } as unknown as Plugin;
    registerCommands(plugin, {} as CommandDependencies);
    const command = commands.find((entry) => entry.id === id);
    expect(command).toBeDefined();
    expect(command!.checkCallback!(true)).toBe(true);
    expect(first.getStore().getState()[field]).toBe(false);
    expect(command!.checkCallback!(false)).toBe(true);
    expect(first.getStore().getState()[field]).toBe(true);
    command!.checkCallback!(false);
    expect(first.getStore().getState()[field]).toBe(false);

    activeView = second;
    command!.checkCallback!(false);
    expect(second.getStore().getState()[field]).toBe(true);
    expect(first.getStore().getState()[field]).toBe(false);
    activeView = null;
    expect(command!.checkCallback!(true)).toBe(false);
    expect(command!.checkCallback!(false)).toBe(false);
  });
});
