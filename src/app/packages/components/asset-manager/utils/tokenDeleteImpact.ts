import { App, TFile } from 'obsidian';
import { groupTokenRefs, type AssetService, type GroupAsset } from '../../../../services/AssetService';
import { findTokenPlacements, removeTokenPlacements } from '../../../../services/tokenAssetPlacements';
import type { AnyAsset } from '../types';

/** Where the token assets about to be deleted are still in use. */
export interface TokenDeleteImpact {
  groups: GroupAsset[];
  maps: TFile[];
  tokenIds: string[];
  imagePaths: string[];
}

function listNames(names: string[]): string {
  const shown = names.slice(0, 5).map((n) => `"${n}"`).join(', ');
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Looks up encounters, player groups and maps that use any of the given token assets. */
export async function findTokenDeleteImpact(
  app: App,
  assetService: AssetService,
  assets: AnyAsset[],
): Promise<TokenDeleteImpact> {
  const tokens = assets.filter((a) => a.type === 'tokens');
  const tokenIds = tokens.map((t) => t.id);
  const imagePaths = tokens.flatMap((t) => (t.imagePath ? [t.imagePath] : []));
  const [groups, maps] = await Promise.all([
    assetService.getGroupsUsingTokens(tokenIds),
    findTokenPlacements(app, imagePaths),
  ]);
  return { groups, maps, tokenIds, imagePaths };
}

/** Extra confirm-dialog paragraphs describing what else the deletion touches. */
export function describeTokenDeleteImpact(impact: TokenDeleteImpact): string[] {
  const ids = new Set(impact.tokenIds);
  const paragraphs: string[] = [];
  if (impact.groups.length > 0) {
    const emptied = impact.groups.filter((g) => groupTokenRefs(g).every((ref) => ids.has(ref.id)));
    const noun = impact.groups.every((g) => g.type === 'encounter') ? 'encounter' : 'group';
    paragraphs.push(`Used in ${plural(impact.groups.length, noun)}: ${listNames(impact.groups.map((g) => g.name))}. The token will be removed from them.`);
    if (emptied.length > 0) {
      paragraphs.push(`${listNames(emptied.map((g) => g.name))} would be left empty and will be deleted too.`);
    }
  }
  if (impact.maps.length > 0) {
    paragraphs.push(`Placed on ${plural(impact.maps.length, 'map')}: ${listNames(impact.maps.map((m) => m.basename))}. Those tokens will be removed from the map.`);
  }
  return paragraphs;
}

/** Removes map placements before the asset image is trashed. Encounter cleanup happens in the asset service. */
export function applyTokenDeleteImpact(app: App, impact: TokenDeleteImpact): Promise<void> {
  return removeTokenPlacements(app, impact.maps, impact.imagePaths);
}
