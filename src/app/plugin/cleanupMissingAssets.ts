import { App, Notice } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { AssetValidationService } from '../services/AssetValidationService';
import { runHistoryTransaction } from '../stores/history';
import { ChoiceModal } from './ChoiceModal';

function describeCount(count: number, singular: string): string | null {
  if (count === 0) return null;
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Finds tokens and backgrounds whose image is gone and offers to drop them from the map. */
export async function cleanupMissingAssets(app: App, view: AtlasView): Promise<void> {
  const store = view.getStore();
  if (!store) {
    new Notice('Unable to access map data');
    return;
  }

  const state = store.getState();
  const validation = await new AssetValidationService({ app }).validateMapAssets({
    background: state.background,
    objects: { tokens: state.objects?.tokens ?? {} },
  });

  const missingTokenIds = validation.missingAssets.filter((a) => a.type === 'token').map((a) => a.objectId);
  const missingBackgrounds = validation.missingAssets.filter((a) => a.type === 'map').length;
  const removable = missingTokenIds.length + missingBackgrounds;

  if (removable === 0) {
    new Notice('No missing assets found');
    return;
  }

  const found = [
    describeCount(missingTokenIds.length, 'token'),
    describeCount(missingBackgrounds, 'map background'),
  ].filter(Boolean).join(' and ');

  const confirmed = await new ChoiceModal<true>(app, {
    title: 'Clean up missing assets',
    message: [`Found ${found} pointing at images that no longer exist.`, 'Remove these references from the map?'],
    buttons: [{ text: 'Remove', value: true, variant: 'warning' }],
  }).prompt();
  if (!confirmed) return;

  runHistoryTransaction(store, () => {
    const actions = store.getState();
    if (missingTokenIds.length > 0) actions.deleteTokens(missingTokenIds);
    if (missingBackgrounds > 0) actions.setBackground(null);
  });

  new Notice(`Cleaned up ${removable} missing asset reference${removable === 1 ? '' : 's'}`);
  await view.saveMap();
}
