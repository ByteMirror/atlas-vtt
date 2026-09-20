import { createDialogShell } from './dialogShell';

export interface ConfirmDialogOptions {
  title: string;
  /** One paragraph per entry. */
  message: string[];
  confirmLabel: string;
  /** Styles the confirm button as a warning, for deletions and overwrites. */
  destructive?: boolean;
}

/**
 * Small centred yes/no dialog. Resolves `true` when confirmed and `false` when
 * cancelled, dismissed via the backdrop or closed with Escape.
 */
export function confirmAction(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const { root, dialog } = createDialogShell(options.title);
    dialog.addClass('atlas-text-dialog--confirm');
    for (const paragraph of options.message) {
      dialog.createEl('p', { cls: 'atlas-text-dialog__message', text: paragraph });
    }

    const actions = dialog.createDiv({ cls: 'atlas-text-dialog__actions' });
    const cancelButton = actions.createEl('button', { text: 'Cancel' });
    const confirmButton = actions.createEl('button', {
      cls: options.destructive ? 'mod-warning' : 'mod-cta',
      text: options.confirmLabel,
    });

    const close = (confirmed: boolean): void => {
      root.remove();
      resolve(confirmed);
    };

    confirmButton.addEventListener('click', () => close(true));
    cancelButton.addEventListener('click', () => close(false));
    root.addEventListener('click', (event) => {
      if (event.target === root) close(false);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(false);
      }
    });

    confirmButton.focus();
  });
}
