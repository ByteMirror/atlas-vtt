import { Notice, type App } from 'obsidian';
import { dynamicLightingOn } from '../../experimental/experimentalFeatures';
import { IMAGE_PRESETS, optimizeImage } from '../../imageProcessing/imageProcessing';
import type { AssetService } from '../../services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../services/AssetThumbnailService';
import { importUvttFile, type UvttImportDeps, type UvttImported } from './importUvttFile';

/** A refusal stays long enough to read its reason. */
const PROBLEM_NOTICE_MS = 12_000;

const counted = (count: number, one: string): string => `${count.toLocaleString('en-US')} ${one}${count === 1 ? '' : 's'}`;

/**
 * What an import brought, for its notice: `Imported "Crypt": 412 walls, 9 doors, 14 lights.`
 * With dynamic lighting switched off the scene shows none of them, which the notice then says.
 */
export function uvttImportSummary({ name, counts, lightsOff, scaledDown }: UvttImported, lightingOn = true): string {
  const parts = [`Imported "${name}": ${counted(counts.walls, 'wall')}, ${counted(counts.doors, 'door')}, ${counted(counts.lights, 'light')}.`];
  if (!lightingOn) parts.push('They show once you switch on dynamic lighting under Experimental features in the command palette.');
  if (lightsOff) parts.push('The lights are switched off, because the image already shows their glow.');
  if (scaledDown) parts.push(`The image was scaled down to ${scaledDown.to.width} × ${scaledDown.to.height} pixels.`);
  return parts.join(' ');
}

function importDeps(app: App, assetService: AssetService): UvttImportDeps {
  return {
    app,
    assetService,
    convertImage: (image) => optimizeImage(image, IMAGE_PRESETS.map, { thumbnail: THUMBNAIL_SPEC }),
    thumbnails: AssetThumbnailService.getInstance(app, assetService),
  };
}

/**
 * Imports Universal VTT files into a collection, one after the other, each with a notice while
 * it runs and one for its result: what it brought, or why it was refused. Returns the imports
 * that arrived.
 */
export async function runUvttImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string): Promise<UvttImported[]> {
  const deps = importDeps(app, assetService);
  const imported: UvttImported[] = [];
  for (const file of files) {
    const progress = new Notice(`Importing ${file.name}…`, 0);
    const result = await importUvttFile(deps, file, collectionId);
    progress.hide();
    if (result.ok) {
      imported.push(result);
      new Notice(uvttImportSummary(result, dynamicLightingOn(app)));
    } else {
      new Notice(`Could not import ${file.name}. ${result.problem}`, PROBLEM_NOTICE_MS);
    }
  }
  if (imported.length > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
  return imported;
}
