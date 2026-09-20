import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { EncounterAsset } from '../../src/app/packages/components/asset-manager/types';

function createAppWithFiles(paths: string[]): any {
  const files = new Set(paths);
  return {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
      getResourcePath: (file: TFile) => `resource://${file.path}`,
    },
  };
}

function renderEncounterCard(asset: EncounterAsset, app: any): void {
  render(
    <TooltipProvider>
      <AssetCard
        asset={asset}
        isSelected={false}
        onSelect={() => {}}
        onContextMenu={() => {}}
        onClose={() => {}}
        draggedItems={null}
        setDraggedItems={() => {}}
        selectedAssetIds={[]}
        view={null}
        addToken={() => 'id'}
        setSelection={() => {}}
        app={app}
        assetService={null}
        spawnCount={1}
        onSpawnCountChange={() => {}}
      />
    </TooltipProvider>
  );
}

describe('AssetCard encounter previews', () => {
  it('renders up to three token previews from encounter token paths', () => {
    const app = createAppWithFiles([
      'atlas-vtt/collections/default/tokens/goblin.webp',
      'atlas-vtt/collections/default/tokens/wolf.webp',
      'atlas-vtt/collections/default/tokens/boss.webp',
      'atlas-vtt/collections/default/tokens/shaman.webp',
    ]);
    const encounter: EncounterAsset = {
      id: 'enc-1',
      name: 'Forest Ambush',
      type: 'encounters',
      tags: [],
      tokens: [
        { id: '1', name: 'Goblin', imagePath: 'atlas-vtt/collections/default/tokens/goblin.webp' },
        { id: '2', name: 'Wolf', imagePath: 'atlas-vtt/collections/default/tokens/wolf.webp' },
        { id: '3', name: 'Boss', imagePath: 'atlas-vtt/collections/default/tokens/boss.webp' },
        { id: '4', name: 'Shaman', imagePath: 'atlas-vtt/collections/default/tokens/shaman.webp' },
      ],
    };

    renderEncounterCard(encounter, app);

    expect(screen.getByAltText('Forest Ambush token 1')).toBeTruthy();
    expect(screen.getByAltText('Forest Ambush token 2')).toBeTruthy();
    expect(screen.getByAltText('Forest Ambush token 3')).toBeTruthy();
    expect(screen.queryByAltText('Forest Ambush token 4')).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
  });
});
