import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';

describe('SettingsService startup', () => {
  it('reads the settings file only once the startup migration has put it in place', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const read = vi.fn(async () => JSON.stringify({ navigation: { inputMode: 'trackpad' } }));
    const app = { vault: { adapter: { exists: async () => true, read } } };

    const settings = new SettingsService(app as never, storageReady);
    // A map tab restored during startup initialises the shared service early.
    const loading = settings.initialize();
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    expect(SettingsService.forApp(app as never)).toBe(settings);

    finishMigration();
    await loading;
    expect(read).toHaveBeenCalledOnce();
    expect(settings.getNavigationSettings().inputMode).toBe('trackpad');
  });

  it('still loads the settings when the migration failed', async () => {
    const app = { vault: { adapter: { exists: async () => true, read: async () => JSON.stringify({ navigation: { inputMode: 'trackpad' } }) } } };
    const settings = new SettingsService(app as never, Promise.reject(new Error('migration failed')));
    await settings.initialize();
    expect(settings.getNavigationSettings().inputMode).toBe('trackpad');
  });

  it('never saves the defaults over the file before it was read', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const write = vi.fn(async () => undefined);
    const app = {
      vault: { adapter: { exists: async () => true, read: async () => JSON.stringify({ navigation: { inputMode: 'mouse' } }), write } },
    };
    const settings = new SettingsService(app as never, storageReady);

    // The plugin unloads during startup, before the settings were loaded.
    const saving = settings.saveSettingsNow();
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();

    finishMigration();
    await saving;
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0][1] as string).navigation.inputMode).toBe('mouse');
  });

  it('reports the old player bar switches until they are carried over, and keeps them for an older Atlas', async () => {
    const stored = { localPlayerView: { showTokenHP: true, showTokenStress: false, showGrid: false } };
    const write = vi.fn(async (_path: string, _content: string) => undefined);
    const app = { vault: { adapter: { exists: async () => true, read: async () => JSON.stringify(stored), write } } };
    const settings = new SettingsService(app as never);
    await settings.initialize();

    expect(settings.legacyPlayerBars()).toEqual({ hp: true, stress: false });
    expect(settings.legacyPlayerBars()).toEqual({ hp: true, stress: false });
    settings.clearLegacyPlayerBars();
    expect(settings.legacyPlayerBars()).toBeNull();
    expect(settings.getLocalPlayerViewSettings().showGrid).toBe(false);

    await settings.saveSettingsNow();
    const saved = JSON.parse(write.mock.calls.at(-1)![1]).localPlayerView;
    expect(saved).toMatchObject({ showTokenHP: true, showTokenStress: false, tokenBarsCarriedOver: true });

    const reopened = new SettingsService({ vault: { adapter: { exists: async () => true, read: async () => JSON.stringify({ localPlayerView: saved }), write } } } as never);
    await reopened.initialize();
    expect(reopened.legacyPlayerBars()).toBeNull();
  });

  it('has no old switches to hand over in a fresh vault', async () => {
    const app = { vault: { adapter: { exists: async () => false } } };
    const settings = new SettingsService(app as never);
    await settings.initialize();
    expect(settings.legacyPlayerBars()).toBeNull();
  });
});
