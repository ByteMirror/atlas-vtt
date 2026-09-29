import { TFile, Modal, App as ObsidianApp, Notice, base64ToArrayBuffer } from 'obsidian';
import type { AssetService, EncounterAsset } from '../services/AssetService';
import { generateEncounterThumbnail } from './encounterThumbnail';
import type { EncounterFormation } from './encounterFormation';
import './encounter-save-modal.scss';
import { runInBackground } from '../utils/backgroundTask';
import { getLocale, t } from '../i18n';

/** One token as it will be stored inside an encounter. */
export type EncounterTokenDraft = EncounterAsset['tokens'][number];

const THUMBNAIL_DIR = 'atlas-vtt/assets/encounter-thumbnails';

function promptForEncounterName(app: ObsidianApp, tokens: EncounterTokenDraft[]): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.setText(t('encounter.saveTitle'));
    const contentEl = modal.contentEl;
    contentEl.createEl('p', { text: t('encounter.createWith', { count: tokens.length }) });

    const previewContainer = contentEl.createDiv({ cls: 'atlas-encounter-save-preview' });

    const thumbEl = previewContainer.createDiv().createEl('img', { cls: 'atlas-encounter-save-thumbnail' });
    runInBackground(
      generateEncounterThumbnail(app, tokens).then((url) => { if (url) thumbEl.src = url; }),
      'Encounter thumbnail preview',
    );

    const list = previewContainer.createDiv();
    list.createEl('p', { text: t('encounter.tokens'), cls: 'setting-item-description' });
    const ul = list.createEl('ul', { cls: 'atlas-encounter-save-tokens' });
    tokens.forEach((t) => ul.createEl('li', { text: t.name }));

    const inputEl = contentEl.createEl('input', {
      type: 'text',
      placeholder: t('encounter.namePlaceholder'),
      value: t('encounter.defaultName', { date: new Date().toLocaleDateString(getLocale()) }),
      cls: 'atlas-encounter-save-input',
    });

    const submit = (): void => {
      const name = inputEl.value.trim();
      if (name) { modal.close(); resolve(name); }
    };

    const btns = contentEl.createDiv({ cls: 'atlas-encounter-save-buttons' });
    btns.createEl('button', { text: t('common.cancel') }).onclick = () => { modal.close(); resolve(null); };
    btns.createEl('button', { text: t('encounter.save'), cls: 'mod-cta' }).onclick = submit;
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') { modal.close(); resolve(null); }
    });

    modal.open();
    window.setTimeout(() => inputEl.focus(), 100);
  });
}

async function saveThumbnailToVault(app: ObsidianApp, tokens: EncounterTokenDraft[]): Promise<string> {
  const dataUrl = await generateEncounterThumbnail(app, tokens);
  if (!dataUrl) return '';

  try {
    const pngData = base64ToArrayBuffer(dataUrl.slice(dataUrl.indexOf(',') + 1));
    try { await app.vault.createFolder(THUMBNAIL_DIR); } catch { /* exists */ }
    const path = `${THUMBNAIL_DIR}/encounter-${Date.now()}.png`;
    await app.vault.createBinary(path, pngData);
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return app.vault.getResourcePath(file);
  } catch (error) {
    console.error('[encounterSaveService] Error saving thumbnail:', error);
  }
  return '';
}

/**
 * Prompt for a name and persist a group of tokens as an encounter asset in `collectionId`.
 * Pass `formation` when the tokens carry cell/offset data captured from a map.
 * Resolves with the created asset, or null when the user cancelled or saving failed.
 */
export async function saveEncounter(
  app: ObsidianApp,
  assetService: AssetService,
  collectionId: string,
  tokens: EncounterTokenDraft[],
  formation?: EncounterFormation,
): Promise<EncounterAsset | null> {
  if (tokens.length === 0) {
    new Notice(t('encounter.noTokens'));
    return null;
  }

  const encounterName = await promptForEncounterName(app, tokens);
  if (!encounterName) return null;

  try {
    const thumbnailUrl = await saveThumbnailToVault(app, tokens);
    const encounter = await assetService.createEncounter({
      name: encounterName,
      collection: collectionId,
      tokens,
      ...(formation ? { formation } : {}),
      difficulty: 'medium',
      tags: [],
      thumbnailUrl,
      data: { description: t('encounter.description', { count: tokens.length }) },
    });
    new Notice(t('encounter.saved', { name: encounterName }));
    return encounter;
  } catch (error) {
    console.error('[encounterSaveService] Error saving encounter:', error);
    new Notice(t('encounter.saveFailed'));
    return null;
  }
}
