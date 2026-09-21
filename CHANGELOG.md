# Atlas VTT changelog

<!-- Generated from changelog/*.md. Run npm run changelog:generate. -->

## 0.1.6 — Scene settings and reliable map switching

2026-09-20

### Improved

- Switch command-palette tabs with Tab and Shift+Tab. Keyboard navigation inside settings panels continues to work as usual.
- Creating a scene no longer asks you to select an unused campaign.

### Fixed

- Grid and token settings now update the active scene correctly.
- Pending map changes are saved before switching scenes.

### Important changes

- Removed the legacy generic-token command. Use the token tools in the asset manager instead.

## 0.1.5 — Creating scenes in collections

2026-09-20

### Fixed

- Creating a scene in a named collection now uses the correct collection folder, including on Windows and when the collection name contains spaces.
- New scenes use the selected collection's grid defaults consistently.
- If scene creation fails, Atlas displays a notice explaining that it could not create the scene.

## 0.1.4 — Compatibility and dependency maintenance

2026-09-20

### Improved

- Updated dependencies and adjusted the plugin bundle for Obsidian's community-plugin requirements.
- ZIP import and export remain available with the updated bundle.

## 0.1.3 — Map switching and asset-manager dialogs

2026-09-20

### Fixed

- Leaving a map clears its old interaction handlers so they cannot respond after switching scenes.
- Confirming or cancelling a deletion keeps the asset manager open.

## 0.1.2 — Atlas VTT for Obsidian

2026-09-20

### New

- Run tabletop sessions with battle maps, square and hex grids, tokens, fog of war, note pins, drawing, measuring, dice, initiative and music.
- Present your game in a separate player window.

### Important changes

- Atlas requires Obsidian 1.8.7 or newer on desktop.
