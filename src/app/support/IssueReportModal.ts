import { Modal, Notice, Setting, type App } from 'obsidian';
import { runInBackground } from '../utils/backgroundTask';
import { formatDiagnostics, type IssueDiagnostics } from './diagnostics';
import { formatErrors, type LoggedError } from './errorLog';
import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';
import { buildIssueUrl, formatReportMarkdown, issueForm, type IssueForm, type IssueReport } from './issueReport';

export interface IssueReportPreset {
  type?: IssueType;
  area?: IssueArea;
}

export interface IssueReportModalOptions {
  preset: IssueReportPreset;
  diagnostics: IssueDiagnostics;
  errors: LoggedError[];
  openExternal: (url: string) => void;
  copyText: (text: string) => Promise<void>;
}

/** Collects a report and hands it to a pre-filled GitHub issue form; nothing is sent from inside Obsidian. */
export class IssueReportModal extends Modal {
  private type: IssueType;
  private area: IssueArea;
  private title = '';
  private description = '';
  private steps = '';
  private includePlugins = true;
  private includeErrors: boolean;
  private descriptionSetting: Setting | undefined;
  private stepsSetting: Setting | undefined;
  private environmentEl: HTMLElement | undefined;

  constructor(app: App, private readonly options: IssueReportModalOptions) {
    super(app);
    this.type = options.preset.type ?? 'bug';
    this.area = options.preset.area ?? 'unknown';
    this.includeErrors = options.errors.length > 0;
  }

  onOpen(): void {
    this.setTitle(this.form.title);
    this.modalEl.addClass('atlas-vtt-plugin', 'atlas-issue-report-modal');
    this.contentEl.createEl('p', {
      cls: 'atlas-issue-report-intro',
      text: 'Atlas opens a pre-filled GitHub issue in your browser. Nothing is sent until you submit it there with your GitHub account.',
    });
    this.renderChoices();
    this.renderText();
    this.renderIncludes();
    this.renderEnvironment();
    this.renderActions();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private get form(): IssueForm {
    return issueForm(this.type);
  }

  private renderChoices(): void {
    new Setting(this.contentEl).setName('Kind of issue').addDropdown(dropdown => {
      dropdown.addOptions(ISSUE_TYPES).setValue(this.type).onChange(value => {
        this.type = value as IssueType;
        this.applyWording();
      });
    });
    new Setting(this.contentEl).setName('Part of Atlas affected').addDropdown(dropdown => {
      dropdown.addOptions(ISSUE_AREAS).setValue(this.area).onChange(value => { this.area = value as IssueArea; });
    });
  }

  private renderText(): void {
    const { description, steps } = this.form.wording;
    new Setting(this.contentEl).setName('Title').setClass('atlas-issue-report-field').addText(text => {
      text.setPlaceholder('One line that summarises the problem').onChange(value => { this.title = value; });
      text.inputEl.setAttribute('maxlength', '120');
    });
    this.descriptionSetting = new Setting(this.contentEl).setName(description.label).setDesc(description.hint)
      .setClass('atlas-issue-report-field').addTextArea(area => {
        area.onChange(value => { this.description = value; });
        area.inputEl.rows = 6;
      });
    this.stepsSetting = new Setting(this.contentEl).setName(steps.label).setDesc(steps.hint)
      .setClass('atlas-issue-report-field').addTextArea(area => {
        area.onChange(value => { this.steps = value; });
        area.inputEl.rows = 5;
      });
  }

  private renderIncludes(): void {
    new Setting(this.contentEl)
      .setName('Include enabled community plugins')
      .setDesc('Plugin names and versions only. Helps with conflicts and compatibility reports.')
      .addToggle(toggle => toggle.setValue(this.includePlugins).onChange(value => {
        this.includePlugins = value;
        this.renderEnvironmentText();
      }));
    const count = this.options.errors.length;
    new Setting(this.contentEl)
      .setName('Include recent Atlas errors')
      .setDesc(count ? `${count} error message${count === 1 ? '' : 's'} from this session, without file paths or note content.` : 'No Atlas errors were recorded in this session.')
      .addToggle(toggle => toggle.setValue(this.includeErrors).setDisabled(count === 0).onChange(value => { this.includeErrors = value; }));
  }

  private renderEnvironment(): void {
    const details = this.contentEl.createEl('details', { cls: 'atlas-issue-report-environment' });
    details.createEl('summary', { text: 'Environment details that will be included' });
    this.environmentEl = details.createEl('pre');
    this.renderEnvironmentText();
  }

  private renderEnvironmentText(): void {
    this.environmentEl?.setText(this.environment());
  }

  private renderActions(): void {
    const actions = this.contentEl.createDiv({ cls: 'atlas-issue-report-actions' });
    new Setting(actions)
      .addButton(button => button.setButtonText('Copy report')
        .onClick(() => runInBackground(this.copyReport(), 'Copying the issue report', 'Could not access the clipboard.')))
      .addButton(button => button.setButtonText('Open GitHub issue').setCta()
        .onClick(() => runInBackground(this.submit(), 'Opening the GitHub issue form', 'Could not prepare the GitHub issue. Use "Copy report" instead.')));
  }

  private applyWording(): void {
    const { title, wording } = this.form;
    this.setTitle(title);
    this.descriptionSetting?.setName(wording.description.label).setDesc(wording.description.hint);
    this.stepsSetting?.setName(wording.steps.label).setDesc(wording.steps.hint);
  }

  private environment(): string {
    return formatDiagnostics(this.options.diagnostics, { includePlugins: this.includePlugins });
  }

  private validate(): IssueReport | null {
    if (!this.title.trim() || !this.description.trim()) {
      new Notice('Add a title and a description first.');
      return null;
    }
    return {
      type: this.type,
      area: this.area,
      title: this.title,
      description: this.description,
      steps: this.steps,
      environment: this.environment(),
      errors: this.includeErrors ? formatErrors(this.options.errors) : '',
    };
  }

  private async copyReport(): Promise<void> {
    const report = this.validate();
    if (!report) return;
    await this.options.copyText(formatReportMarkdown(report));
    new Notice('Report copied. Paste it into a new issue on GitHub.');
  }

  private async submit(): Promise<void> {
    const report = this.validate();
    if (!report) return;
    const { url, complete } = buildIssueUrl(report);
    if (!complete) {
      await this.options.copyText(formatReportMarkdown(report));
      new Notice('The report is too long for a link. The full report was copied; paste the missing parts into the GitHub form.', 10000);
    }
    this.options.openExternal(url);
    this.close();
  }
}
