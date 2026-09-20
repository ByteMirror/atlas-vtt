import { describe, expect, it } from 'vitest';

import { formatServiceAsset } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import type { EncounterAsset } from '../../src/app/services/AssetService';

function createMockApp(): any {
  return {
    vault: {
      getAbstractFileByPath: () => null,
      getResourcePath: () => '',
    },
  };
}

describe('assetFormatters folder paths', () => {
  it('derives encounter folderId from filePath in subfolders', () => {
    const app = createMockApp();
    const encounter: EncounterAsset = {
      id: 'enc-1',
      type: 'encounter',
      name: 'Forest Ambush',
      filePath: 'atlas-vtt/collections/default/encounters/bandits/forest-ambush.json',
      tags: [],
      collection: 'default',
      createdAt: 1,
      modifiedAt: 1,
      tokens: [],
      data: {},
    };

    const formatted = formatServiceAsset(
      encounter,
      'encounters',
      'atlas-vtt/collections/default/encounters',
      app
    ) as any;

    expect(formatted.folderId).toBe('folder-atlas-vtt/collections/default/encounters/bandits');
    expect(formatted.filePath).toBe(encounter.filePath);
  });
});
