import { App, normalizePath } from 'obsidian';
import { AssetService } from './AssetService';

/**
 * Generates plain labelled disc tokens ("P1", "E3", "Basti") as WebP images in
 * the vault and registers them as token assets. The token ring is drawn by the
 * renderer, so these images stay deliberately flat: a coloured disc and text.
 */

const ASSETS_DIR = 'atlas-vtt/assets';
const CANVAS_SIZE = 256;
const PLAYER_COLOR = '#2f6fed';
const ENEMY_COLOR = '#c0392b';

/** Edit this list to change which generic tokens the command produces. */
export const GENERIC_TOKEN_LABELS: string[] = [
  'P1', 'P2', 'P3', 'P4',
  'Basti', 'Luca', 'Jojo',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9',
];

/** Enemy slots are red; players and named characters are blue. */
export function colorForLabel(label: string): string {
  return /^e\d+$/i.test(label) ? ENEMY_COLOR : PLAYER_COLOR;
}

export function fileNameForLabel(label: string): string {
  return `generic-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;
}

/** Draw a labelled disc and encode it as WebP. */
export async function renderLabelTokenBlob(label: string, color: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[GenericTokenService] Could not acquire 2D context');

  const center = CANVAS_SIZE / 2;
  const radius = center - 8;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Shrink the type until the label fits inside the disc.
  const maxWidth = radius * 1.5;
  let fontSize = 128;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `bold ${fontSize}px sans-serif`;
    fontSize -= 4;
  } while (fontSize > 16 && ctx.measureText(label).width > maxWidth);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, center, center + 4);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to encode token "${label}"`))),
      'image/webp',
      0.92
    );
  });
}

export interface GenericTokenResult {
  created: number;
  registered: number;
  skipped: number;
}

/**
 * Create one token asset per label.
 *
 * The image file and the asset-manager entry are tracked separately: a token is
 * only skipped when it is actually registered as an asset. An orphaned image
 * (file on disk, no entry) gets re-registered instead of silently ignored.
 */
export async function generateGenericTokens(
  app: App,
  labels: string[] = GENERIC_TOKEN_LABELS
): Promise<GenericTokenResult> {
  const assetService = AssetService.getInstance(app);

  if (!app.vault.getAbstractFileByPath(normalizePath(ASSETS_DIR))) {
    await app.vault.createFolder(ASSETS_DIR);
  }

  const existingAssetPaths = new Set(
    (await assetService.getTokenAssets()).map((asset) => normalizePath(asset.imagePath))
  );

  let created = 0;
  let registered = 0;
  let skipped = 0;

  for (const label of labels) {
    const imagePath = normalizePath(`${ASSETS_DIR}/${fileNameForLabel(label)}`);

    if (existingAssetPaths.has(imagePath)) {
      skipped += 1;
      continue;
    }

    if (app.vault.getAbstractFileByPath(imagePath)) {
      // Image survived from an earlier run but its asset entry is missing.
      registered += 1;
    } else {
      const blob = await renderLabelTokenBlob(label, colorForLabel(label));
      await app.vault.createBinary(imagePath, await blob.arrayBuffer());
      created += 1;
    }

    await assetService.addTokenAsset({
      name: label,
      imagePath,
      tags: ['generic'],
      collection: 'default',
    });
  }

  return { created, registered, skipped };
}
