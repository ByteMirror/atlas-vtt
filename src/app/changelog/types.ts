export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  markdown: string;
}

export interface ReleaseBundle {
  version: string;
  releases: ReleaseNote[];
}

export interface ChangelogOptions {
  releases: ReleaseNote[];
  currentVersion: string;
  newVersions: Set<string>;
  showOnUpdate: boolean;
  onPreferenceChange: (enabled: boolean) => void;
  onClose: (rendered: boolean) => void;
}
