import type { App } from 'obsidian';
import { SettingsService } from '../services/SettingsService';

/**
 * Features the GM switches on in the command palette's Experimental features page. All are off
 * until then, and the choice is stored in Atlas' settings (`AtlasSettings.experimental`) under
 * the feature's id, so never rename one.
 */
export const EXPERIMENTAL_FEATURES = [
  {
    id: 'dynamicLighting',
    label: 'Dynamic lighting',
    hint: 'Walls, lights, token vision and senses: the Lighting tool, and a collection\'s Vision settings. While off, lit scenes show unlit and keep their walls and lights.',
  },
] as const;

export type ExperimentalFeatureId = (typeof EXPERIMENTAL_FEATURES)[number]['id'];

/** Whether the GM switched the feature on; off wherever Atlas' settings cannot be reached. */
export function experimentalFeatureOn(app: App | undefined, id: ExperimentalFeatureId): boolean {
  return SettingsService.forApp(app)?.isExperimentalOn(id) ?? false;
}

export function dynamicLightingOn(app: App | undefined): boolean {
  return experimentalFeatureOn(app, 'dynamicLighting');
}
