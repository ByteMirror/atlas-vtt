import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal, Notice, Setting, type App } from 'obsidian';
import { Select, type SelectOption } from '../packages/components/primitives/Select';
import { runInBackground } from '../utils/backgroundTask';
import { formatDiagnostics, type IssueDiagnostics } from './diagnostics';
import { formatErrors, type LoggedError } from './errorLog';
import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';
import { formatReportMarkdown, issueForm, type IssueForm, type IssueReport } from './issueReport';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';

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

const TYPE_LABEL_ID = 'atlas-issue-report-type-label';
const AREA_LABEL_ID = 'atlas-issue-report-area-label';

function selectOptions<T extends string>(labels: Record<T, string>): SelectOption<T>[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
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
  private typeRoot: Root | undefined;
  private areaRoot: Root | undefined;

  constructor(app: App, private readonly options: IssueReportModalOptions) {
    super(app);
    this.type = options.preset.type ?? 'bug';
    this.area = options.preset.area ?? 'unknown';
    this.includeErrors = options.errors.length > 0;
  }

  onOpen(): void {
    this.setTitle(this.form.title);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-issue-report-modal');
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
    this.clearContent();
  }

  private clearContent(): void {
    this.typeRoot?.unmount();
    this.areaRoot?.unmount();
    this.typeRoot = this.areaRoot = undefined;
    this.contentEl.empty();
  }

  private get form(): IssueForm {
    return issueForm(this.type);
  }

  private renderChoices(): void {
    const choices = this.contentEl.createDiv({ cls: 'atlas-issue-report-choices' });
    this.typeRoot = createRoot(this.choiceField(choices, 'Issue type', TYPE_LABEL_ID));
    this.areaRoot = createRoot(this.choiceField(choices, 'Area', AREA_LABEL_ID));
    this.renderSelects();
  }

  /** A labelled field whose name element carries `id` so the select can reference it. */
  private choiceField(container: HTMLElement, name: string, id: string): HTMLElement {
    const setting = new Setting(container).setName(name).setClass('atlas-issue-report-field');
    setting.nameEl.id = id;
    return setting.controlEl;
  }

  /** Both selects are controlled from the modal's state, so every change re-renders them. */
  private renderSelects(): void {
    this.typeRoot?.render(<Select labelledBy={TYPE_LABEL_ID} value={this.type} options={selectOptions(ISSUE_TYPES)} onChange={value => {
      this.type = value;
      this.applyWording();
      this.renderSelects();
    }} />);
    this.areaRoot?.render(<Select labelledBy={AREA_LABEL_ID} value={this.area} options={selectOptions(ISSUE_AREAS)} onChange={value => {
      this.area = value;
      this.renderSelects();
    }} />);
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
    // The status sits above the actions so the buttons stay flush with the dialog's bottom edge.
    this.statusEl = this.contentEl.createEl('p', { cls: 'atlas-issue-report-status' });
    this.statusEl.setAttribute('role', 'alert');
    const actions = this.contentEl.createDiv({ cls: 'atlas-issue-report-actions' });
    new Setting(actions)
      .addButton(button => button.setButtonText('Copy report')
        .onClick(() => runInBackground(this.copyReport(), 'Copying the issue report', 'Could not access the clipboard.')))
      .addButton(button => {
        this.submitButton = button.buttonEl;
        button.setButtonText('Submit report').setCta()
          .onClick(() => { void this.submit(); });
      });
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
    const controls = [...this.contentEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, [role="combobox"]')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    this.statusEl?.setText('');
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = 'Submitting…';
    }
    try {
      const receipt = await this.options.submitReport(report, this.submission.id);
      this.clearContent();
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
