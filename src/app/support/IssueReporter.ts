import type { App, PluginManifest } from 'obsidian';
import { collectDiagnostics } from './diagnostics';
import type { AtlasErrorLog } from './errorLog';
import { IssueReportModal, type IssueReportPreset } from './IssueReportModal';

/** Entry point shared by the command palette and the settings tab. */
export class IssueReporter {
  constructor(
    private readonly app: App,
    private readonly manifest: PluginManifest,
    private readonly errorLog: AtlasErrorLog,
  ) {}

  open(preset: IssueReportPreset = {}): void {
    new IssueReportModal(this.app, {
      preset,
      diagnostics: collectDiagnostics(this.app, this.manifest),
      errors: this.errorLog.recent(),
      openExternal: url => { window.open(url); },
      copyText: text => navigator.clipboard.writeText(text),
    }).open();
  }
}
