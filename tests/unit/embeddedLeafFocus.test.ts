import { describe, expect, it, vi } from 'vitest';
import { restorePreservedLeaf } from '../../src/app/utils/embeddedLeafFocus';

describe('restorePreservedLeaf', () => {
  it('restores the preserved leaf while it is still the selected workspace leaf', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active" id="statblock-leaf">
        <div id="statblock-view"></div>
      </div>
      <div class="workspace-leaf" id="map-leaf">
        <div id="map-view"></div>
      </div>
    `;

    const preservedLeaf = {
      view: {
        containerEl: document.getElementById('statblock-view'),
      },
    };
    const workspace = {
      setActiveLeaf: vi.fn(),
    };

    restorePreservedLeaf(workspace, preservedLeaf as any);

    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(preservedLeaf, { focus: false });
  });

  it('does not reassert a stale preserved leaf after the user switched to another tab', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf" id="statblock-leaf">
        <div id="statblock-view"></div>
      </div>
      <div class="workspace-leaf mod-active" id="map-leaf">
        <div id="map-view"></div>
      </div>
    `;

    const preservedLeaf = {
      view: {
        containerEl: document.getElementById('statblock-view'),
      },
    };
    const workspace = {
      setActiveLeaf: vi.fn(),
    };

    restorePreservedLeaf(workspace, preservedLeaf as any);

    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  });
});
