import { exploredSaveSize } from '../../lighting/exploredMaskCodec';

/** Encodes the explored memory as a small PNG data URL for the map file. */
export function saveExploredMask(source: HTMLCanvasElement): string {
  const size = exploredSaveSize(source);
  const canvas = createEl('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  context?.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/png');
}
