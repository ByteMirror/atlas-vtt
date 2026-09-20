# Atlas VTT

A game system agnostic virtual tabletop for tabletop RPGs that runs inside [Obsidian](https://obsidian.md). 

I built Atlas as part of my bachelor's thesis to give the TTRPG community a virtual tabletop that's source-available, hackable, and free for noncommercial use. Every file Atlas creates, every token, every map, every world you build, stays yours and stays local. It follows the same philosophy as Obsidian: your work lives on your machine, in formats you control, with no account and no server in between.

TTRPG worlds in my opinion are something very personal and players and DMs get attached to them. That attachment deserves better than a subscription and someone else's database. Atlas makes sure your creative output stays yours, just like a sheet of paper would.

Atlas VTT is desktop only.

## Features

- **Maps and scenes**: turn any image in your vault into a map (`.atlasmap` file), organise maps into collections and switch scenes from a tab bar.
- **Grids**: square and hexagonal grids (pointy-top and flat-top), a manual alignment tool and automatic grid detection from the map image.
- **Tokens**: drag tokens from the asset manager, snap to the grid, resize, multi-select, copy and paste. Save groups of tokens as reusable encounters.
- **Fog of war**: reveal and hide areas with brush, rectangle and lasso tools.
- **Drawing and measuring**: freehand drawing, shapes, text, an eraser and distance measurement in grid units.
- **Note pins**: pin markdown notes and even other Atlas map files to map locations and preview or edit them without leaving the map.
- **Player view**: a separate window for a second screen that shows the map without GM-only information.
- **Dice, initiative and widgets**: dice roller with roll log, initiative tracker and configurable counters.
- **Music player**: playlists built from audio files in your vault.
- **Statblocks**: link tokens to creature notes rendered by the [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin (optional).
- **Customisable map hotkeys and guided onboarding** for common tools and settings.
- **Undo and redo** for map edits.

## Installation

### Beta via BRAT

Atlas VTT is available for desktop beta testing through [BRAT](https://github.com/TfTHacker/obsidian42-brat), before its community-directory release.

1. Install and enable **BRAT** from Obsidian's community plugins.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter `ByteMirror/atlas-vtt` and select the latest version.
4. Enable **Atlas VTT** under **Settings → Community plugins** if it is not enabled automatically.

BRAT can install updates when new GitHub releases are published. Beta builds may have bugs; try them in a test vault or a backed-up campaign vault first.

### Community directory and manual installation

Once Atlas VTT is listed in the community directory: open **Settings → Community plugins → Browse**, search for "Atlas VTT", install and enable it.

To install manually, download `main.js`, `manifest.json` and `styles.css` from a [GitHub release](https://github.com/ByteMirror/atlas-vtt/releases) into `<your vault>/.obsidian/plugins/atlas-vtt/`, then enable the plugin under **Settings → Community plugins**.

## Getting started

1. Run the command **Atlas VTT: Open dashboard** from the command palette.
2. Import a map image via the plus button in the top right of the asset manager and create a Scene using that map.
3. Align the grid: use automatic detection, or mark a few grid cells with the alignment tool.
4. Import tokens and spawn them on the created scene.
5. If you play locally with other players open the player view and move it to your second screen.

Maps are stored as `.atlasmap` files in your vault. Plugin data such as asset tags and thumbnails is stored in a hidden `.atlas-data` folder in the vault root.

## Privacy and network use

Atlas VTT works offline. It has no accounts, no telemetry and no ads, and it does not contact any server on its own. See [PRIVACY.md](PRIVACY.md) for details.

## Building from source

Requires Node.js 22 or newer.

```bash
npm ci
npm run build   # production build into ./dist
npm run dev     # watch build
npm test
```

`npm run dev` and `npm run build` also copy the build into `test-vault/.obsidian/plugins/atlas-vtt/` if that vault exists next to the sources.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Credits

Widget icons come from [game-icons.net](https://game-icons.net) by Lorc, Delapouite, Skoll, sbed and Carl Olsen, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The black background was removed and the glyphs recoloured.

Licences of bundled libraries are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Atlas VTT is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You can inspect, modify, and share the code for the purposes permitted by that license. Commercial use or incorporation into a commercial project requires separate permission from Fabian Urbanek.

The license covers Atlas's software, not ownership of your campaign notes, maps, or other content. Third-party components retain their own licenses, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
