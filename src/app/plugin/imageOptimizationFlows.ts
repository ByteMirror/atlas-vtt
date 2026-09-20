import { App, Notice } from 'obsidian';
import type { ImageOptimizationService } from '../services/ImageOptimizationService';
import { ChoiceModal } from './ChoiceModal';

const LARGE_IMAGE_THRESHOLD_KB = 500;

type OriginalsChoice = 'delete' | 'keep';

function askWhatToDoWithOriginals(app: App, title: string, message: string[], hint: string): Promise<OriginalsChoice | null> {
  return new ChoiceModal<OriginalsChoice>(app, {
    title,
    message,
    hint,
    buttons: [
      { text: 'Optimize and delete originals', value: 'delete', variant: 'cta' },
      { text: 'Optimize and keep originals', value: 'keep' },
    ],
  }).prompt();
}

/** Converts every large image in the vault to WebP after asking what to do with the originals. */
export async function optimizeVaultImages(app: App, service: ImageOptimizationService): Promise<void> {
  const largeImages = await service.findLargeImages(LARGE_IMAGE_THRESHOLD_KB);
  if (largeImages.length === 0) {
    new Notice('No large images found in vault');
    return;
  }

  const totalBytes = largeImages.reduce((sum, file) => sum + file.stat.size, 0);
  const choice = await askWhatToDoWithOriginals(
    app,
    'Optimize vault images',
    [
      `Found ${largeImages.length} large images (total: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB).`,
      'This will convert them to WebP format and optionally delete the originals.',
    ],
    'Original files can be deleted to save space (recommended).'
  );
  if (!choice) return;

  const progressNotice = new Notice('Optimizing images…', 0);
  const results = await service.optimizeMultipleImages(
    largeImages,
    { deleteOriginals: choice === 'delete' },
    (completed, total, current) => {
      progressNotice.setMessage(`Optimizing images: ${completed}/${total}${current ? ` - ${current}` : ''}`);
    }
  );
  progressNotice.hide();

  service.showOptimizationSummary(results);
}

/** Converts the images of one folder to WebP after asking what to do with the originals. */
export async function optimizeFolderImages(app: App, service: ImageOptimizationService, folderPath: string): Promise<void> {
  const folderName = app.vault.getFolderByPath(folderPath)?.name || 'root';
  const choice = await askWhatToDoWithOriginals(
    app,
    'Optimize folder images',
    [`Optimize all images in the "${folderName}" folder?`],
    'This will convert PNG/JPG images to WebP format.'
  );
  if (!choice) return;

  const progressNotice = new Notice('Optimizing folder images…', 0);
  const { results } = await service.optimizeDirectory(folderPath, { deleteOriginals: choice === 'delete' });
  progressNotice.hide();

  if (results.length > 0) {
    service.showOptimizationSummary(results);
  } else {
    new Notice('No images to optimize in this folder');
  }
}
