import { Modal, Notice, Setting, type App } from 'obsidian';
import { runInBackground } from '../utils/backgroundTask';
import { formatDiagnostics, type IssueDiagnostics } from './diagnostics';
import { formatErrors, type LoggedError } from './errorLog';
import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';
import { formatReportMarkdown, issueForm, type IssueForm, type IssueReport } from './issueReport';

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
  submitReport: (report: IssueReport, requestId: string) => Promise<{ number: number; url: string }>;
}

/** Submits a report in Obsidian and keeps the draft until the service confirms creation. */
export class IssueReportModal extends Modal {
  private type: IssueType;
  private area: IssueArea;
  private submitting = false;
  private submission: { body: string; id: string } | undefined;
  private submitButton: HTMLButtonElement | undefined;
  private statusEl: HTMLElement | undefined;
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
      text: 'Submit your report directly from Atlas. Your report and included diagnostics will be posted publicly on GitHub. No GitHub account is needed.',
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
      .addButton(button => {
        this.submitButton = button.buttonEl;
        button.setButtonText('Submit report').setCta()
          .onClick(() => { void this.submit(); });
      });
    this.statusEl = this.contentEl.createEl('p', { cls: 'atlas-issue-report-status' });
    this.statusEl.setAttribute('role', 'alert');
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
    if (this.submitting) return;
    const report = this.validate();
    if (!report) return;
    const body = JSON.stringify(report);
    if (this.submission?.body !== body) {
      this.submission = { body, id: crypto.randomUUID() };
    }
    this.submitting = true;
    const controls = [...this.contentEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    this.statusEl?.setText('');
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = 'Submitting…';
    }
    try {
      const receipt = await this.options.submitReport(report, this.submission.id);
      this.contentEl.empty();
      this.setTitle('Report submitted');
      this.contentEl.createEl('p', { text: `Report submitted as #${receipt.number}. Thank you for helping improve Atlas.` });
      new Setting(this.contentEl)
        .addButton(button => button.setButtonText('View issue')
          .onClick(() => this.options.openExternal(receipt.url)))
        .addButton(button => button.setButtonText('Close').setCta().onClick(() => this.close()));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send your report.';
      this.statusEl?.setText(`${message} Your report is still here. Try again or copy it to save it.`);
    } finally {
      this.submitting = false;
      controls.forEach((control, index) => { control.disabled = disabled[index]!; });
      if (this.submitButton) {
        this.submitButton.disabled = false;
        this.submitButton.textContent = 'Submit report';
      }
    }
  }
}
