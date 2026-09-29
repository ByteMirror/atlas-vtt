import { Notice } from 'obsidian';

let shown = false;

/** Tells the user once per session that maps are drawn without the GPU, and how to get it back. */
export function showSoftwareRenderingNotice(): void {
  if (shown) return;
  shown = true;
  new Notice(
    'Atlas cannot use your graphics card, so maps are drawn without it: they may be slower, and outlines, glows and some effects are missing. Turn on hardware acceleration in Obsidian\'s general settings, or check your graphics drivers.',
    15000,
  );
}
