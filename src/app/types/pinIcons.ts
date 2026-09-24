import { PIN_ICON_PATHS, type PinIconId } from './pinIconPaths';
import { isPinLabelKind, type PinLabelKind } from '../tools/pinLabels';

export { PIN_ICON_PATHS, type PinIconId };

/** A pin colour in both themes: deeper on light backgrounds, brighter on dark ones. */
export interface PinTone {
  light: string;
  dark: string;
}

/** Heraldic palette shared by every pin, so a map full of pins reads as one set. */
const TONES = {
  gules: { light: '#b3261e', dark: '#e5534b' },
  tenne: { light: '#c2410c', dark: '#f0883e' },
  or: { light: '#a16207', dark: '#e3b341' },
  amber: { light: '#b45309', dark: '#f5a524' },
  vert: { light: '#2e7d32', dark: '#5cb860' },
  sea: { light: '#0f766e', dark: '#3fb5a8' },
  azure: { light: '#1d5fa8', dark: '#5b9be0' },
  indigo: { light: '#4338ca', dark: '#8b8cf0' },
  purpure: { light: '#6d3fa8', dark: '#a67be0' },
  rose: { light: '#be185d', dark: '#ec6ba6' },
  earth: { light: '#8a5a2b', dark: '#c99562' },
  stone: { light: '#57606a', dark: '#a3abb5' },
} as const satisfies Record<string, PinTone>;

export interface PinIconDefinition {
  id: PinIconId;
  name: string;
  tone: PinTone;
}

export interface PinPlaceGroup {
  name: string;
  places: PinIconDefinition[];
}

const icon = (id: PinIconId, name: string, tone: PinTone): PinIconDefinition => ({ id, name, tone });

/** The location marker: the place picker's default and the icon of its palette slot until a place is chosen. */
export const LOCATION_PIN_ICON = icon('location', 'Location', TONES.vert);

/** Places offered by the palette's location slot, grouped as the picker shows them: from the scale of a world map down to a room. */
export const PIN_PLACE_GROUPS: PinPlaceGroup[] = [
  {
    name: 'Realm',
    places: [
      LOCATION_PIN_ICON,
      icon('world', 'World', TONES.azure),
      icon('map', 'Map', TONES.or),
      icon('city', 'City', TONES.stone),
      icon('village', 'Village', TONES.earth),
      icon('castle', 'Castle', TONES.stone),
      icon('tower', 'Tower', TONES.purpure),
      icon('outpost', 'Outpost', TONES.earth),
      icon('port', 'Port', TONES.azure),
      icon('farm', 'Farm', TONES.amber),
      icon('road', 'Road', TONES.earth),
      icon('crossroads', 'Crossroads', TONES.amber),
      icon('bridge', 'Bridge', TONES.stone),
      icon('signpost', 'Signpost', TONES.earth),
      icon('camp', 'Camp', TONES.tenne),
    ],
  },
  {
    name: 'Wilderness',
    places: [
      icon('forest', 'Forest', TONES.vert),
      icon('jungle', 'Jungle', TONES.vert),
      icon('mountain', 'Mountain', TONES.stone),
      icon('hills', 'Hills', TONES.vert),
      icon('waterfall', 'Waterfall', TONES.azure),
      icon('swamp', 'Swamp', TONES.sea),
      icon('desert', 'Desert', TONES.amber),
      icon('oasis', 'Oasis', TONES.sea),
      icon('island', 'Island', TONES.azure),
      icon('volcano', 'Volcano', TONES.gules),
    ],
  },
  {
    name: 'Landmarks',
    places: [
      icon('cave', 'Cave', TONES.stone),
      icon('dungeon', 'Dungeon', TONES.gules),
      icon('ruins', 'Ruins', TONES.earth),
      icon('mine', 'Mine', TONES.or),
      icon('graveyard', 'Graveyard', TONES.stone),
      icon('standing-stones', 'Standing stones', TONES.sea),
      icon('shrine', 'Shrine', TONES.tenne),
      icon('portal', 'Portal', TONES.purpure),
      icon('lighthouse', 'Lighthouse', TONES.amber),
      icon('shipwreck', 'Shipwreck', TONES.azure),
    ],
  },
  {
    name: 'Town',
    places: [
      icon('house', 'House', TONES.earth),
      icon('manor', 'Manor', TONES.purpure),
      icon('temple', 'Temple', TONES.or),
      icon('inn', 'Inn', TONES.tenne),
      icon('shop', 'Shop', TONES.amber),
      icon('smithy', 'Smithy', TONES.stone),
      icon('library', 'Library', TONES.azure),
      icon('stable', 'Stable', TONES.earth),
      icon('well', 'Well', TONES.sea),
      icon('gate', 'Gate', TONES.stone),
    ],
  },
  {
    name: 'Interior',
    places: [
      icon('secret-door', 'Secret door', TONES.stone),
      icon('door', 'Door', TONES.earth),
      icon('stairs', 'Stairs', TONES.stone),
      icon('trapdoor', 'Trapdoor', TONES.earth),
      icon('pit', 'Pit', TONES.gules),
      icon('lever', 'Lever', TONES.amber),
      icon('cell', 'Cell', TONES.stone),
      icon('throne', 'Throne', TONES.or),
      icon('altar', 'Altar', TONES.purpure),
      icon('statue', 'Statue', TONES.stone),
      icon('coffin', 'Coffin', TONES.earth),
      icon('ritual-circle', 'Ritual circle', TONES.gules),
      icon('bed', 'Bed', TONES.azure),
      icon('fireplace', 'Fireplace', TONES.tenne),
      icon('cauldron', 'Cauldron', TONES.sea),
      icon('barrel', 'Barrel', TONES.earth),
      icon('crate', 'Crate', TONES.earth),
      icon('torch', 'Torch', TONES.tenne),
      icon('desk', 'Desk', TONES.earth),
      icon('mirror', 'Mirror', TONES.azure),
    ],
  },
];

/** One slot of the pin palette: an icon, the place picker, or an auto-labelled sequence. */
export type PinPaletteSlot =
  | { kind: 'icon'; icon: PinIconDefinition }
  | { kind: 'places' }
  | { kind: 'label'; id: PinLabelKind; name: string; sample: string };

export const PIN_PALETTE: PinPaletteSlot[] = [
  { kind: 'icon', icon: icon('pin', 'Pin', TONES.gules) },
  { kind: 'icon', icon: icon('note', 'Note', TONES.azure) },
  { kind: 'icon', icon: icon('treasure', 'Treasure', TONES.or) },
  { kind: 'icon', icon: icon('combat', 'Combat', TONES.tenne) },
  { kind: 'icon', icon: icon('boss', 'Boss', TONES.purpure) },
  { kind: 'icon', icon: icon('lore', 'Lore', TONES.sea) },
  { kind: 'icon', icon: icon('trap', 'Trap', TONES.earth) },
  { kind: 'places' },
  { kind: 'icon', icon: icon('quest', 'Quest', TONES.indigo) },
  { kind: 'icon', icon: icon('important', 'Important', TONES.amber) },
  { kind: 'icon', icon: icon('npc', 'NPC', TONES.rose) },
  { kind: 'icon', icon: icon('secret', 'Secret', TONES.stone) },
  // Enumerated pins: the store assigns the next free label of the sequence on placement
  { kind: 'label', id: 'number', name: 'Numbered (1, 2, 3…)', sample: '1' },
  { kind: 'label', id: 'letter', name: 'Lettered (A, B, C…)', sample: 'A' },
];

export const DEFAULT_PIN_ICON: PinIconId = 'pin';

/** Ids of the Lucide icons pins used before the pin icon set. */
const LEGACY_PIN_ICONS: Record<string, PinIconId> = {
  'scroll': 'note',
  'coins': 'treasure',
  'swords': 'combat',
  'skull': 'boss',
  'info': 'lore',
  'alert-triangle': 'trap',
  'map-pin': 'location',
  'flag': 'quest',
  'star': 'important',
  'heart': 'npc',
  'eye': 'secret',
};

const DEFINITIONS = new Map<PinIconId, PinIconDefinition>(
  [
    ...PIN_PLACE_GROUPS.flatMap((group) => group.places),
    ...PIN_PALETTE.flatMap((slot) => (slot.kind === 'icon' ? [slot.icon] : [])),
  ].map((definition) => [definition.id, definition]),
);

/** Icons chosen through the palette's location slot rather than a slot of their own. */
export function isPlacePinIcon(id: string): id is PinIconId {
  return PIN_PLACE_GROUPS.some((group) => group.places.some((place) => place.id === id));
}

/** Maps any stored pin icon (including legacy Lucide ids) to a palette choice: a pin icon or a label sequence. */
export function resolvePinIcon(stored: string | undefined): PinIconId | PinLabelKind {
  if (isPinLabelKind(stored)) return stored;
  if (!stored) return DEFAULT_PIN_ICON;
  if (stored in PIN_ICON_PATHS) return stored as PinIconId;
  return LEGACY_PIN_ICONS[stored] ?? DEFAULT_PIN_ICON;
}

export function getPinIconDefinition(id: PinIconId): PinIconDefinition {
  const definition = DEFINITIONS.get(id);
  if (!definition) throw new Error(`[pinIcons] Pin icon "${id}" has no definition`);
  return definition;
}
