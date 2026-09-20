import type React from 'react';

export interface CommandOption {
  id: string;
  icon: React.ReactNode | null;
  label: string;
  keywords?: string[];
  shortcut?: string;
  section: string;
  action?: () => void;
  isToggle?: boolean;
  isActive?: boolean;
  hasSubmenu?: boolean;
  submenu?: CommandOption[];
}

export const SETTINGS_PANEL_IDS = [
  'grid-settings',
  'token-settings',
  'widget-settings',
  'local-player-view-settings',
] as const;

export type SettingsPanelId = (typeof SETTINGS_PANEL_IDS)[number];

export function isSettingsPanelId(id: string | null): id is SettingsPanelId {
  return id !== null && (SETTINGS_PANEL_IDS as readonly string[]).includes(id);
}
