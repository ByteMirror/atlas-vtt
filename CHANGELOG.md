# Atlas VTT changelog

<!-- Generated from changelog/*.md. Run npm run changelog:generate. -->

## 0.3.0 — Map switcher, scene snapshots and copy and paste

2026-09-24

### New

**New Feature: Map Switcher**

- Hit 'g' to open a keyboard friendly map/tab switcher (hotkey adjustable in settings)

**New Feature: Snapshots**

- Save multiple save states of a map under a name. Restore it later, for example to run the same fight with another group. Open the command palette (spacebar) and choose Scene snapshots. Snapshots move with their scene and export with their collection.

**General**

- Copy, cut, paste and duplicate on maps. This works for tokens, drawings, texts and pins. Use Ctrl/Cmd+C, X, V and D. Paste puts the objects at the cursor, also on another open map.
- Spawn many copies of a token at once. In the asset manager, hover a token, type a number and press Go. You can also right-click it and choose Spawn Multiple. On the map, hold Alt/Option while you drag to make copies.
- Updated Collection Export to include more granular Settings and a thumbnail
- See the drag distance when you drag tokens
- Choose how diagonals count on square grids in the collection settings

### Improved

- Improved Performance for Atlas Maps. They use much less CPU and GPU
- The player view copies a new frame only when the map changes.
- Switching maps is much faster now.
- Improved animations throughout Atlas
- Improved performance of Maps tab in Asset Manager
- Token controls grow with the token. Large creatures get large bars, nameplates and handles.
- Delete and Backspace also remove selected texts and pins.
- Import and export dialogs stay open and show the result until you close them.
- Dates in the note picker use your app language.

### Fixed

- Fixed memory leak when map switching
- Old player windows no longer stay open in the background after you reload Obsidian.
- Atlas releases token art and the player view's old map when you leave them.
- The player view shows the initiative tracker and widgets of its own map. Another open map no longer changes them.
- Pinned note previews are saved with their map. They come back in the same place, with the same scroll position and mode.
- Import of a collection you already have no longer stops without a message.
- Import asks for a new name when the name is already in use.
- A new collection no longer replaces a collection with the same name.
- Collection updates also update token art.
- Imports check each file. Atlas refuses damaged files and files that go outside its folder.
- A failed import undoes its changes. Atlas backs up each file before it replaces or removes it.
- Export tells you about missing files. It no longer skips them without a message.
- Imports during an asset manager refresh no longer add duplicate tokens or remove tokens.
- The Show Nameplate setting of a token stays as you set it when you link or unlink a statblock.
- Ctrl/Cmd no longer opens a preview from a map you left.
- Number badges show on new tokens at once. Before, you had to move a token first.
- Dice cards and the roll log show a token's portrait as it looks on the map.
- Encounters keep the ring setting of their tokens.
- Renamed collections keep their scenes, maps and tokens. This includes the default collection.
- When you rename, move or delete a collection folder in the file explorer, the asset manager and dashboard update.
- Collections with the same name get a number, for example "Default (2)".
- Collections with a name of more than one word show their assets.
- Manage Tags & Collections: "Delete selected" deletes the items.
- Manage Tags & Collections: tag names you change are saved.
- Manage Tags & Collections: right-click → Delete removes the row you clicked.
- Atlas no longer removes tokens at startup before Obsidian lists all files.
- If Atlas cannot read its asset index at startup, it tries again. If it fails again, it keeps a copy and builds a new index from your collection files.

## 0.2.3 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can complete its source review. The lint suppressions file moved to a name ESLint does not load on its own, so the review's own ESLint run no longer exits with a configuration error. The plugin itself is unchanged from 0.2.0.

## 0.2.2 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can complete its source review. Every script file in the repository now belongs to a TypeScript project, so the review's parser no longer fails on the test suite and build scripts. The plugin itself is unchanged from 0.2.0.

## 0.2.1 — Maintenance release

2026-09-22

### Fixed

- Obsidian's community directory can review the plugin source again. The lint configuration no longer aborts on `package.json`. The plugin itself is unchanged from 0.2.0.

## 0.2.0 — Token resources, bulk statblock import and asset manager upgrades

2026-09-22

### New

- Set maximum HP and secondary resource values in Edit Token, with per-token overrides of linked statblock defaults.

- Choose a token's size from its right-click menu on the map: Medium (1×1), Large (2×2), Huge (3×3) or Gargantuan (4×4).
- Give token assets a default size in the token creator, when editing a token, or from the asset manager's right-click menu. Tokens spawn at that size, and it travels with collection exports. Fantasy Statblocks imports pick it up from the creature's size.
- The ruler follows the grid's Snap to grid setting: switch snapping off to measure from any point.
- Click a selected token's HP or secondary-resource bar to edit it: the bar highlights on hover, and a popover opens below it with current and maximum fields. Type a number or a `+5`/`-3` adjustment, use the arrow keys to step (Shift for tens), Tab between fields, Enter or click away to apply, Escape to cancel.
- Choose whether to share the DM’s initiative tracker in the local player view. The read-only player panel appears only while the DM tracker is open and player sharing is enabled, independently of other widgets. Turn order and rounds update live; hidden tokens stay private.

- Select several assets or folders in the asset manager like in a file manager: Ctrl/Cmd-click adds or removes single items, Shift-click selects everything between the last clicked item and the one you click.
- Tab and Shift+Tab cycle through the asset manager tabs, like in the command palette.
- Ctrl/Cmd+F in the asset manager jumps to the search box.
- Ctrl/Cmd+A in the asset manager selects all items of one kind: every folder when a folder is selected, otherwise every asset in the current view.
- Import tokens from Fantasy Statblocks in bulk. Preview creatures with local artwork, choose a collection, and create linked tokens while skipping existing imports and preserving original notes and images.
- Hold Shift and click tokens to add them to or remove them from the selection, then drag any of them to move the whole group.
- New scenes align their grid to the map image on their own the first time they open. Maps without a grid simply open without one; the grid alignment tool remains available for corrections.
- Read what's new after an Atlas update and browse previous releases in an offline changelog. Open it anytime with the View changelog command or from Atlas settings.
- Turn automatic update announcements on or off in Atlas settings or in the changelog.
- Report a bug or suggest a feature from inside Obsidian with the Report an issue command or from Atlas settings under Help and feedback. Atlas fills in your Atlas and Obsidian versions and submits your report directly, preserving the chosen issue type and affected area. No GitHub account or second form is needed.

### Improved

- Browse release notes in a fixed-size changelog with a scrolling history, release sections and a feature-update-only announcement option. Beta builds include their pending notes.
- The issue-report form uses Atlas dropdowns and grouped categories, with only its text fields scrolling.

- Exporting a collection now packs everything it needs: scenes with their map files, backgrounds and previews, token art and thumbnails, encounters, and the Fantasy Statblocks notes tokens link to together with their artwork, plus the collection's tags and settings. Importing restores all of it into the new vault with working scene previews and statblock links, and a progress dialog shows what is being packed or written.
- Hover highlights in the asset manager, dropdown menus and context menus now appear and disappear instantly, and every item also shows a pressed highlight while you click it.
- Deleting a token asset now tells you which encounters and maps still use it, removes it from them on confirm, and deletes encounters that would be left empty.
- Fantasy Statblocks artwork now opens in the same token import cards as uploaded images, with crop controls, tags for selected tokens, and individual or global ring choices.

- Dice roll toasts now look like a game HUD: a large glowing result, a ringed portrait, an accent-tinted ability label and knotwork corners. Natural 20s glow gold and natural 1s glow crimson, and the number lands with the reveal chime.
- The asset manager stays quick with large libraries: it keeps its index in memory, shows small thumbnails instead of full-size token art (existing tokens get theirs in the background), and only renders the cards on screen.
- Fantasy Statblocks imports now open inside the existing token creator. Filter by system/layout and choose the Atlas ring for all tokens or individually. Tokens imported without a ring retain their full artwork on the map.

- Grid auto-detect now lines up across the whole map instead of drifting towards the edges, finds faint grids on busy art, and no longer reports a grid on maps that have none or picks the wrong grid type. The result tells you how much of the map the grid was found on.
- Grids draw in black or white, whichever stands out against the map image, instead of cyan. Maps still on the old cyan default switch over automatically; pick Auto in the grid colour swatches to return to this after choosing a colour.

### Fixed

- Spawning several selected tokens from the asset manager keeps each token's ring setting and default size, matching single spawns.
- The current and maximum numbers on token gauges sit close together around the slash. Changing a maximum in the bar popover preserves it as a token override.
- Deleting an open scene no longer makes Atlas and Obsidian both close its view. Closing the active scene loads the next scene and restores its viewport and undo history.
- Closing a map waits for its pending saves to finish, and overlapping saves keep their original order.

- Token HP and secondary-resource fills keep their rounded leading edge at low values. Clicking a selected token's bar keeps the value editor open, and changing only the secondary-resource maximum refreshes its bar and label.
- Token artwork and glass overlays update throughout resize and rotation gestures, including after release.
- Edit Token no longer draws an extra frame around its fields, and its actions use the shared button states.

- Scene tabs and widgets share the top row, with widgets aligned right and the initiative tracker kept clear. The view-actions menu sits at the bottom right.

- Resize and rotation handles on selected tokens respond to clicks and drags again instead of deselecting the token.
- Deleting or renaming a collection in Manage Tags & Collections now sticks: the collection and its assets are removed from the vault, and the dropdown no longer shows it after reopening the asset manager. Deleting asks for confirmation first, and the default collection cannot be deleted.
- Right-clicking assets, folders and tags in the asset manager opened from the dashboard shows the context menu again, including when no map is open or another map tab was closed.
- Fantasy Statblocks import actions stay in a padded footer while the list scrolls, and the system/layout filter uses the Atlas dropdown.

- The local player window no longer shows hidden tokens, the selection outline, marquee, token controls or resize and rotation handles from the DM view.
- Imported collections open their scenes again and keep each token's ring setting and statblock link.
- Token ring toggles keep their full button height in the importer sidebar and use the consistent label “Toggle token ring”.

- Clicking controls in Manage Tags or closing the dialog no longer closes the asset manager behind it.
- Token import ring controls now share the editable preview state, and fast-loading images no longer get stuck optimizing.

- Shift+2 centers the selected token at a readable on-screen size across map resolutions and window sizes, with room around it in small panes.

- Local player windows refresh at the display frame rate without the display-only label or FPS counter, and reconnect to the presented scene after Obsidian reloads.

- Creating a token from a statblock image no longer mistakes the source artwork for an existing token.
- Opening a settings dropdown closes the previous one, including when switching with the keyboard or between map views.
- Grid settings dropdowns keep opening after other map tabs close, and size to their button unless longer options need more room.
- The unit type picker in collection default settings uses the Atlas dropdown menu instead of the native system menu.
- Ctrl/Cmd+hover statblock previews open when you press the key while already over a token, and tall statblocks scroll inside the card with a soft edge shadow instead of running off the screen.

### Important changes

- Removed the music and ambience player.
- Removed the vault-wide and current-folder image optimization commands. Images are still optimized during import.
- Removed the New map from image command. Create scenes through the scene browser.

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
