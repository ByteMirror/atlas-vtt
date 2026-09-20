import { View, type Workspace, type WorkspaceLeaf } from 'obsidian';

type WorkspaceWithSetActiveLeaf = {
  setActiveLeaf?: ((leaf: WorkspaceLeaf | null, options?: { focus?: boolean }) => void) | undefined;
};

/** The leaf that currently owns workspace focus, whatever its view type. */
export function getActiveWorkspaceLeaf(workspace: Pick<Workspace, 'getActiveViewOfType'>): WorkspaceLeaf | null {
  return workspace.getActiveViewOfType(View)?.leaf ?? null;
}

function getWorkspaceLeafElement(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
  const candidate = (
    (leaf as (WorkspaceLeaf & { view?: { containerEl?: HTMLElement | null } }) | null | undefined)?.view?.containerEl
    ?? (leaf as (WorkspaceLeaf & { containerEl?: HTMLElement | null }) | null | undefined)?.containerEl
    ?? null
  );

  if (!(candidate instanceof HTMLElement)) {
    return null;
  }

  return candidate.closest('.workspace-leaf');
}

export function isWorkspaceLeafSelected(leaf: WorkspaceLeaf | null | undefined): boolean {
  return getWorkspaceLeafElement(leaf)?.classList.contains('mod-active') ?? false;
}

export function suppressActiveLeaf(workspace: WorkspaceWithSetActiveLeaf): () => void {
  const originalSetActiveLeaf = workspace.setActiveLeaf?.bind(workspace);
  if (!originalSetActiveLeaf) {
    return () => {};
  }

  workspace.setActiveLeaf = (() => {});
  return () => {
    workspace.setActiveLeaf = originalSetActiveLeaf;
  };
}

export function restorePreservedLeaf(
  workspace: WorkspaceWithSetActiveLeaf,
  leafToPreserve: WorkspaceLeaf | null | undefined,
): void {
  if (!leafToPreserve || typeof workspace.setActiveLeaf !== 'function') {
    return;
  }

  if (!isWorkspaceLeafSelected(leafToPreserve)) {
    return;
  }

  workspace.setActiveLeaf(leafToPreserve, { focus: false });
}
