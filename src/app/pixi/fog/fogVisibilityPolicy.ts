export function resolveFogPreviewAlpha(params: {
  isPlayerView: boolean;
  isGMView: boolean;
}): number {
  if (params.isPlayerView) {
    return 1.0;
  }
  return params.isGMView ? 0.5 : 1.0;
}

export function canInteractWithFog(params: {
  isPlayerView: boolean;
}): boolean {
  return !params.isPlayerView;
}
