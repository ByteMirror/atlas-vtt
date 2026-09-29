import type { TokenEntity } from '../../types';

/** Ctrl/Cmd prefers the statblock; Shift selects the individual Markdown note. */
export function tokenPreviewPath(token: TokenEntity | undefined, shift = false): string | undefined {
  const statblock = token?.kind === 'character' ? token.statblockPath : undefined;
  return linkedPreviewPath(statblock, token?.notePath, shift);
}

export function linkedPreviewPath(statblock: string | undefined, note: string | undefined, shift: boolean): string | undefined {
  return shift ? note || statblock : statblock || note;
}

/** The selected preview is a Markdown note only when that link wins the modifier priority. */
export function isLinkedNotePreview(statblock: string | undefined, note: string | undefined, shift: boolean): boolean {
  return Boolean(note && (shift || !statblock));
}
