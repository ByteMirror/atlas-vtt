# Dice packs

A dice pack decides what Atlas VTT's physical dice look like: the art on their
faces, their colour, their finish and whether their edges are rounded. A pack
is a folder holding a `pack.json` and the face sheets it names.

Atlas ships one pack, **Default** (white dice, black numbers, sharp edges), in
the plugin folder under `dice/Texture-Pack-Default/`. A collection can add its
own: they live in the collection's folder, at
`atlas-vtt/collections/<collection>/dice/<pack>/`, so they move and delete
with it.

## Using a pack

1. Open the asset manager and go to the **Dice** tab.
2. Press **Import pack folder** and pick the folder that holds `pack.json`.
   Atlas copies it into the collection.
3. Press **Use for collection** on the pack. The pack in use says **In use**.
4. Set the dice panel to **Physical** and roll.

The pack can also be chosen in **Collection Settings → Physical Dice**, next to
the dice's size, shadows, light and how they settle. Changes apply from the
next roll. Deleting a pack moves its folder to the trash; a collection that
used it goes back to Default.

## Making a pack

The quickest way is to start from Default, since its sheets already match the
dice's shapes:

1. Copy `dice/Texture-Pack-Default/` out of the Atlas plugin folder and rename
   the copy.
2. Repaint the face sheets. Keep every number where it is: the layout tells
   Atlas which part of the image lands on which face.
3. Edit `pack.json`: give the pack a `name`, and change `color`, `bevel` and
   `material` to taste (see below).
4. Import the folder in the asset manager's **Dice** tab.

### The folder

```
My Pack/
├── pack.json
├── d4_Numbers.png
├── d6_Numbers.png
├── d8_Numbers.png
├── d10_Numbers.png
├── d10_Percent_Numbers.png   (the tens die of a percentile roll)
├── d12_Numbers.png
└── d20_Numbers.png
```

Face sheets are PNG, JPEG or WebP. A die with no sheet renders in the pack's
plain colour. When a die names no `texture`, Atlas looks for
`<type>_Numbers.png`.

### Face sheets

A face sheet is a net of the die, unfolded flat. Atlas paints the die's colour
underneath it, so:

- where the sheet is **transparent**, the die shows its colour;
- where it is **opaque**, the sheet's own pixels show: numbers, pips, symbols.

Default's sheets are 1024 × 1024 with black numbers on a clear background. For
light numbers on a dark die, set a dark `color` and paint the numbers light.

### pack.json

```json
{
  "name": "My Pack",
  "color": "#ffffff",
  "bevel": { "enabled": false, "depth": 0.1, "smooth": 1 },
  "material": { "shininess": 100, "specular": "#222222", "transparent": false, "opacity": 1 },
  "dice": {
    "d20": { "texture": "d20_Numbers.png", "scale": 1, "rimUV": [0.85, 0.5], "sheetSize": 1024, "numbers": [], "faces": [] }
  }
}
```

The whole set:

| Field | What it does |
| --- | --- |
| `name` | Shown in the Dice tab and Collection Settings. |
| `color` | The dice's colour, unless a die sets its own. |
| `bevel.enabled` | Rounds the edges off. `false` gives sharp edges. |
| `bevel.depth` | How much of the edge is taken off. |
| `bevel.smooth` | 0 shades the rim as a flat chamfer, 1 lets light run round the corner. |
| `material.shininess`, `material.specular` | How glossy the dice are, and the colour of their highlights. |
| `material.transparent`, `material.opacity` | See-through dice, from 0 (invisible) to 1 (solid). |

Each entry under `dice` (`d4`, `d6`, `d8`, `d10`, `d100`, `d12`, `d20`):

| Field | What it does |
| --- | --- |
| `texture` | The face sheet, relative to the pack folder. |
| `normal` | Optional normal map for surface relief, same folder. |
| `color` | This die's own colour, for a set that is not all one colour. |
| `scale` | Size relative to the other dice in the set. |
| `geometry` | Build this die as another shape. The percentile die is `"d10"`. |
| `rimUV` | A point on the sheet (0–1 across and down) with nothing painted on it. A bevelled rim is coloured from there. |
| `grid` | Where each face sits, for nets on a grid (the d6 cross): `cols`, `rows` and `cells` of `{ number, col, row, rotation }`, `rotation` in quarter turns. |
| `faces`, `sheetSize` | Where each face sits, for nets on no grid: `corners` in sheet pixels (`sheetSize` is the sheet's width), how far the art is turned (`turn`), and whether it is `mirror`ed. The d4 lists its `vertices` instead, because it is read at a corner. |
| `numbers` | Which number each face of the 3D model carries, in the model's own face order. |

`grid`, `faces` and `numbers` describe the layout of Default's sheets. Keep
them as they are when you repaint those sheets; they only need changing for a
sheet laid out differently. `numbers` follows the 3D model's face order and
keeps opposite faces adding up the way a real die's do, so change it only
together with `faces`.

### Numbers on the physical dice

The d10 is numbered 0–9 and the percentile die 00–90, as on real dice. A d10
showing 0 counts as 10. A d100 roll throws the percentile die together with a
d10: 40 and 7 is 47, 00 and 0 is 100.
