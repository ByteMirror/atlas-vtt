import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
}));

import { showExploredTravelNotice, showLightingUnavailableNotice } from '../lightingNotices';

describe('showLightingUnavailableNotice', () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it('says that lighting could not run and what Atlas shows instead', () => {
    showLightingUnavailableNotice(false);
    expect(notices).toEqual(['Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow.']);
  });

  it('adds how to try again when the engine was only held back', () => {
    showLightingUnavailableNotice(true);
    expect(notices[0]).toMatch(/^Dynamic lighting could not run on this graphics device\. Atlas shows line of sight without light and shadow\. Switch dynamic lighting off and on to try again\.$/);
  });
});

describe('showExploredTravelNotice', () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it('names what undo and redo did to the explored memory', () => {
    showExploredTravelNotice(true);
    showExploredTravelNotice(false);
    expect(notices).toEqual(['Undid an edit of the explored memory.', 'Redid an edit of the explored memory.']);
  });
});
