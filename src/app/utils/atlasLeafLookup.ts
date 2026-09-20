import type { WorkspaceLeaf } from 'obsidian';

interface WorkspaceLike {
  getLeavesOfType?: (type: string) => WorkspaceLeaf[];
}

export function findAtlasLeafByViewId(
  workspace: WorkspaceLike,
  viewId: string,
  allowedViewTypes: string[] = ['atlas-vtt', 'atlas-vtt-player'],
): WorkspaceLeaf | null {
  for (const viewType of allowedViewTypes) {
    const matchingLeaf = workspace.getLeavesOfType?.(viewType)
      ?.find((leaf) => (leaf.view as { viewId?: string } | undefined)?.viewId === viewId);
    if (matchingLeaf) {
      return matchingLeaf;
    }
  }

  return null;
}
