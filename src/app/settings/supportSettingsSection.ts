import type { IssueReporter } from '../support/IssueReporter';
import type { AtlasSettingSection } from './settingSections';

export function supportSettingsSection(reporter: IssueReporter): AtlasSettingSection {
  return {
    heading: 'Help and feedback',
    rows: [
      {
        name: 'Report an issue',
        desc: 'Opens a pre-filled GitHub issue with your Atlas and Obsidian versions. Also available as the "Report an issue" command.',
        aliases: ['bug', 'crash', 'problem', 'feedback', 'github', 'support'],
        render: setting => {
          setting.addButton(button => button.setButtonText('Report an issue').onClick(() => reporter.open({ type: 'bug' })));
        },
      },
      {
        name: 'Suggest a feature',
        desc: 'Tell us what would make Atlas better at your table.',
        aliases: ['idea', 'request', 'enhancement'],
        render: setting => {
          setting.addButton(button => button.setButtonText('Suggest a feature').onClick(() => reporter.open({ type: 'feature' })));
        },
      },
    ],
  };
}
