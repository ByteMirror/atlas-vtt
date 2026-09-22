import type { ChangelogService } from '../changelog/ChangelogService';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';

export function changelogSettingsSection(settings: SettingsService, changelog: ChangelogService, version: string): AtlasSettingSection {
  return {
    heading: 'Updates',
    rows: [
      {
        name: 'Changelog',
        desc: `Installed version ${version}. Browse new features, improvements and fixes.`,
        aliases: ['release notes', 'what is new', 'history', 'version'],
        render: setting => {
          setting.addButton(button => button.setButtonText('View changelog').onClick(() => changelog.open()));
        },
      },
      {
        name: 'Show changelog after updates',
        desc: 'Open release notes once after updating Atlas. You can always view the changelog here.',
        render: setting => {
          let unsubscribe: (() => void) | undefined;
          setting.addToggle(toggle => {
            toggle.setValue(settings.getSetting('showChangelogOnUpdate'))
              .onChange(enabled => {
                if (settings.getSetting('showChangelogOnUpdate') !== enabled) settings.setSetting('showChangelogOnUpdate', enabled);
              });
            // The preference can also change while the changelog is open.
            unsubscribe = settings.onChange(value => { toggle.setValue(value.showChangelogOnUpdate); });
          });
          return unsubscribe;
        },
      },
      {
        name: 'Feature updates only',
        desc: 'Show feature releases such as 1.2 and 1.3. Skip patches such as 1.2.1.',
        render: setting => {
          let unsubscribe: (() => void) | undefined;
          setting.addToggle(toggle => {
            toggle.setValue(settings.getSetting('changelogMajorUpdatesOnly'))
              .setDisabled(!settings.getSetting('showChangelogOnUpdate'))
              .onChange(enabled => {
                if (settings.getSetting('changelogMajorUpdatesOnly') !== enabled) settings.setSetting('changelogMajorUpdatesOnly', enabled);
              });
            unsubscribe = settings.onChange(value => {
              toggle.setValue(value.changelogMajorUpdatesOnly);
              toggle.setDisabled(!value.showChangelogOnUpdate);
            });
          });
          return unsubscribe;
        },
      },
    ],
  };
}
