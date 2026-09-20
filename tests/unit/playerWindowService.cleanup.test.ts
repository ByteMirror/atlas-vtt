import { describe, expect, test, vi, beforeEach } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({
  AtlasView: class AtlasView {},
}));

import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

describe('PlayerWindowService cleanup', () => {
  beforeEach(() => {
    const existing = PlayerWindowService.getInstance();
    existing?.destroy();
  });

  test('unsubscribes widget updates and clears singleton on destroy', () => {
    const unsubscribe = vi.fn();
    const store = {
      getState: () => ({
        widgetSettings: {
          globalVisible: true,
          position: 'top',
          scale: 1,
          widgets: {
            action: {
              id: 'action',
              type: 'counter',
              icon: 'shield',
              label: 'Action',
              value: 3,
              visible: true,
              visibleToPlayers: true,
              order: 0,
            },
          },
        },
      }),
      subscribe: vi.fn(() => unsubscribe),
    };

    const service = new PlayerWindowService({ workspace: {} } as any, store as any);
    const container = document.createElement('div');

    (service as any).renderWidgets(container);

    expect(PlayerWindowService.getInstance()).toBe(service);

    service.destroy();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(PlayerWindowService.getInstance()).toBeNull();
  });
});
