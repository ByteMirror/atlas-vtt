import type { StatblockItem, StatblockLayout, StatblockMonster } from '../react/components/statblock/statblockTypes';
import type { Character, TokenResourceValue } from '../types';
import type { TokenVitals } from './statblockVitalsSync';

export interface StatblockResource extends TokenResourceValue {
  key: string;
  label: string;
  display: 'pips' | 'gauge';
  /** Stress tracks count spent boxes; HP values count remaining health. */
  spent: boolean;
}

export type StatblockResourceUpdate = Partial<Pick<Character, 'hp' | 'stress' | 'maxStress' | 'hope' | 'statblockResources'>>;

const normalized = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '');

/** Whether a statblock key or label ("hp", "Hit Points:", "Health") names hit points. */
export function isHitPointsKey(key: string): boolean {
  return ['hp', 'health', 'hitpoints'].includes(normalized(key.replace(/:\s*$/, '')));
}

const canonical = (key: string): string => isHitPointsKey(key) ? 'hp' : normalized(key);
const resourceNames = new Set(['hp', 'stress', 'hope', 'mana', 'mp', 'stamina', 'energy', 'shield', 'shields', 'resolve', 'luck', 'focus', 'strain', 'wounds', 'ammo', 'charges']);
const clamp = (current: number, max: number): number => Math.max(0, Math.min(max, current));

function numeric(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Only parse concrete quantities, never roll a dice expression or guess from prose. */
export function parseResourceValue(value: unknown, spent = false): TokenResourceValue | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const max = numeric(record.max);
    const current = numeric(record.current ?? record.value ?? (spent ? 0 : max));
    return max !== null && current !== null ? { current: clamp(current, max), max } : null;
  }
  if (typeof value === 'string') {
    const fraction = value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (fraction) return parseResourceValue({ current: fraction[1], max: fraction[2] });
    // Common HP notation: average followed by its hit-dice formula.
    const average = value.trim().match(/^(\d+)\s*\(\s*\d+d\d+(?:\s*[+-]\s*\d+)?\s*\)$/i);
    if (average) value = average[1];
  }
  const max = numeric(value);
  return max === null ? null : { current: spent ? 0 : max, max };
}

function layoutItems(items: StatblockItem[]): StatblockItem[] {
  return items.flatMap((item) => [item, ...layoutItems(item.nested ?? []),
    ...(item.conditions ?? []).flatMap((condition) => layoutItems(condition.nested))]);
}

/** Fantasy Statblocks has no resource schema: recognize quantities, not arbitrary combat stats. */
export function getStatblockResources(monster: StatblockMonster, layout: StatblockLayout, token: TokenVitals): StatblockResource[] {
  const items = layoutItems(layout.blocks);
  const daggerheart = layout.id === 'daggerheart-adversary' || items.some((item) =>
    item.type === 'javascript' && item.code?.includes('adversary-name') && item.code.includes('checkbox'));
  const resources = new Map<string, StatblockResource>();

  const add = (sourceKey: string, value: unknown, options: { key?: string; label?: string; pips?: boolean; spent?: boolean } = {}): void => {
    const key = options.key ?? canonical(sourceKey);
    if (resources.has(key)) return;
    const spent = options.spent ?? ['stress', 'strain', 'wounds'].includes(key);
    let parsed = parseResourceValue(value, spent);
    const stored = key === 'hp' || key === 'stress' || key === 'hope' ? token[key] : token.statblockResources?.[key];
    if (stored !== undefined) {
      if (typeof stored === 'object') parsed = parseResourceValue(stored);
      else {
        const current = numeric(stored);
        const max = key === 'stress' ? numeric(token.maxStress) ?? parsed?.max : parsed?.max;
        if (current !== null) parsed = { current: clamp(current, max ?? current), max: max ?? current };
      }
    }
    if (!parsed) return;
    const label = options.label ?? (key === 'hp' ? 'HP' : sourceKey.replace(/[_-]/g, ' ').replace(/^./, (s) => s.toUpperCase()));
    const pips = options.pips ?? (daggerheart && (key === 'hp' || key === 'stress'));
    resources.set(key, { key, label, ...parsed, spent,
      display: pips && Number.isInteger(parsed.max) && parsed.max <= 40 ? 'pips' : 'gauge' });
  };

  for (const [sourceKey, value] of Object.entries(monster)) {
    const key = canonical(sourceKey);
    if (key === 'stress' && Array.isArray(value)) {
      const headers = items.find((item) => item.type === 'table' && item.properties?.includes(sourceKey))?.headers;
      value.forEach((track, index) => add(sourceKey, track, { key: `stress.${index}`, label: `${headers?.[index] ?? index + 1} stress`, pips: true, spent: true }));
    } else if (resourceNames.has(key) || (value && typeof value === 'object' && 'max' in value && ('current' in value || 'value' in value))) {
      const display = items.find((item) => item.type === 'property' && item.properties?.includes(sourceKey))?.display;
      add(sourceKey, value, display ? { label: display.replace(/:\s*$/, '') } : {});
    } else if (key === 'resources' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, resource] of Object.entries(value)) {
        add(name, resource, { key: `resources.${name}` });
      }
    }
  }
  // Keep existing token vitals available even if a layout omits their source fields.
  for (const key of ['hp', 'stress', 'hope'] as const) {
    if (token[key] !== undefined) add(key, token[key]);
  }
  for (const [key, value] of Object.entries(token.statblockResources ?? {})) add(key, value, { key });
  return [...resources.values()];
}

export function getResourceUpdate(token: TokenVitals, resource: StatblockResource, current: number): StatblockResourceUpdate {
  const value = { current: clamp(Number.isFinite(current) ? current : resource.current, resource.max), max: resource.max };
  if (resource.key === 'hp') return { hp: value };
  if (resource.key === 'stress') return { stress: typeof token.stress === 'object' ? value : value.current, maxStress: value.max };
  if (resource.key === 'hope') return { hope: value };
  return { statblockResources: { ...token.statblockResources, [resource.key]: value } };
}
