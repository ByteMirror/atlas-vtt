import { ATLAS_DISCORD_URL, ATLAS_GITHUB_URL } from '../support/communityLinks';
import type { IssueReporter } from '../support/IssueReporter';
import type { AtlasSettingSection } from './settingSections';

export function supportSettingsSection(reporter: IssueReporter): AtlasSettingSection {
  return {
    heading: 'Help and feedback',
    rows: [
      {
        name: 'Report an issue',
        desc: 'Submit a report from Atlas with your Atlas and Obsidian versions. No GitHub account is needed. Also available as the "Report an issue" command.',
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
      {
        name: 'Discord community',
        desc: 'Get help, share feedback and ideas, and hear about new releases first.',
        aliases: ['discord', 'community', 'chat', 'help'],
        render: setting => {
          setting.addButton(button => button.setButtonText('Join Discord').onClick(() => { window.open(ATLAS_DISCORD_URL); }));
        },
      },
      {
        name: 'GitHub',
        desc: 'Browse the source code, follow development and read the release history.',
        aliases: ['github', 'source code', 'repository', 'releases'],
        render: setting => {
          setting.addButton(button => button.setButtonText('Open GitHub').onClick(() => { window.open(ATLAS_GITHUB_URL); }));
        },
      },
    ],
  };
}
