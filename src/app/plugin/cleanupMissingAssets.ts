import { App, Notice } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { AssetValidationService } from '../services/AssetValidationService';
import { runHistoryTransaction } from '../stores/history';
import { ChoiceModal } from './ChoiceModal';
import { formatList, t } from '../i18n';

/** Finds tokens and backgrounds whose image is gone and offers to drop them from the map. */
export async function cleanupMissingAssets(app: App, view: AtlasView): Promise<void> {
  const store = view.getStore();
  if (!store) {
    new Notice(t('cleanup.noMapData'));
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
    new Notice(t('cleanup.nothingMissing'));
    return;
  }

  const found = formatList([
    missingTokenIds.length > 0 ? t('cleanup.tokens', { count: missingTokenIds.length }) : '',
    missingBackgrounds > 0 ? t('cleanup.backgrounds', { count: missingBackgrounds }) : '',
  ].filter(Boolean));

  const confirmed = await new ChoiceModal<true>(app, {
    title: t('cleanup.title'),
    message: [t('cleanup.found', { found }), t('cleanup.confirm')],
    buttons: [{ text: t('common.remove'), value: true, variant: 'warning' }],
  }).prompt();
  if (!confirmed) return;

  runHistoryTransaction(store, () => {
    const actions = store.getState();
    if (missingTokenIds.length > 0) actions.deleteTokens(missingTokenIds);
    if (missingBackgrounds > 0) actions.setBackground(null);
  });

  new Notice(t('cleanup.done', { count: removable }));
  await view.saveMap();
}
