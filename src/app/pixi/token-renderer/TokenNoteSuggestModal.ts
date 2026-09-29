import { App, FuzzySuggestModal, TFile } from 'obsidian';

/** Vault-wide Markdown picker for a token's individual note link. */
export class TokenNoteSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly select: (path: string) => void) {
    super(app);
    this.setPlaceholder('Search Markdown notes...');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.select(file.path);
  }
}
