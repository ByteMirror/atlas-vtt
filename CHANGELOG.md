# Atlas VTT changelog

<!-- Generated from changelog/*.md. Run npm run changelog:generate. -->

## 0.4.0 — Creature filters, hexcrawl maps, loot roller, progress clocks and moving between collections

2026-09-28

### New

**New Feature: Creature Filters**

- Filter your characters in the asset manager by what their linked statblocks say: challenge rating, level, tier, type, traits, rarity, alignment and source, whatever game system they come from. Atlas offers the filters your statblocks have, so a D&D 5e statblock gives challenge rating and a Pathfinder or Old-School Essentials one level.
- Type filters into the search: `type:beast`, `cr:1-3`, `cr>=5`, `tag:forest` or `statblock:no`. Suggestions list the filters and the values your characters have with their counts; Tab or Enter completes them.
- Or open the filter panel with the button at the end of the search: ranges show how many characters have each value and step through exactly those values, so challenge rating moves from 1/4 to 1/2 to 1. Options show how many characters each one would add.
- Exclude with a double-click on an option (or Alt-click), or type `-type:beast`: the chip reads "not beast" and hides every beast. Click it again to clear it.
- Alignment filters by its parts, Lawful, Neutral, Chaotic, Good, Evil, Unaligned and Any, instead of every way a statblock words it. Pick Chaotic and Evil to find chaotic evil creatures.
- Every active filter shows as a chip above your characters; click one to remove it, or Reset to clear them all. Filters with several values fold into one chip that lists them.
- Press Cmd+F (Ctrl+F on Windows and Linux) in the asset manager to jump to the search.
- Sort characters by Rating: challenge rating, level or tier, whichever their statblock has.
- In Collection Settings → Creature Filters, switch off filters a collection does not need, or add filters on other fields of your statblocks. Atlas lists the fields it finds and how many statblocks have each.
- Works with statblock notes Fantasy Statblocks has not parsed, such as notes in a vault where its "auto parse" setting is off.

**New Feature: Hexcrawl Maps**

- Number every hex of a hex grid. Choose "Column and row (0101)" or "Sequential (1, 2, 3)" under Hex numbers in the grid settings, and set how strong the numbers show with Number opacity. Hexes cut off at the map edge get no number.
- Link a note to a hex: with the Note Pin tool, hold Shift and click a hex. The pin you chose sits in the centre of the hex.
- Point at a linked hex to highlight it with its number and note name, click it to open the note, or Cmd/Ctrl-hover to preview it. Right-click to change the note or unlink the hex.
- Shift-click a linked hex with the Note Pin tool to link a different note to it.

**New Widget: Progress Clocks**

- Track progress the way Blades in the Dark and other Forged in the Dark games do: add a Clock widget, name it and pick 3, 4, 6, 8, 10 or 12 segments. Fill or clear a segment with + and -, or click a wedge to fill the clock up to it. Clocks show how many segments are filled in their centre ("3/6"); switch Show count off for the plain pie.
- Clocks work like counters: hold the widget's number key and press + or - to step them, share them across a collection, undo changes, and show them to players, who see the wedges fill in the player view.

**Move and Copy Between Collections**

- Right-click scenes, maps, encounters or characters in the asset manager and choose Move to Collection or Copy to Collection. Works on everything you have selected at once.
- Everything an asset needs comes along: a scene brings its thumbnail, snapshots, background and the notes its pins open, a character its artwork and statblock. Files another asset of the old collection still uses are copied instead of taken away, and shared artwork stays where it is, so neither collection loses anything.
- Moved assets keep their links: encounters still find their characters, and scenes open in Atlas move along without closing. A scene takes on the conditions and resource bars of its new collection, and tags come along with their colours.
- A copy is fully independent: it has its own artwork and files, so deleting either one leaves the other intact. Copies made together point at each other, so a copied encounter spawns the copied characters. A statblock belongs to one character, so a copied character keeps the statblock only when the statblock note is copied along with it (notes stored in the collection are); otherwise Atlas tells you, and you can link the copy with Link Statblock.
- Scenes linked by pins travel together. Moving or copying a scene offers to take the scenes it links to along (for a move, also the scenes that link to it), so every link keeps working in the new collection. Leave them behind and Atlas removes those links: a scene only links to scenes of its own collection, since opening a scene of another collection would switch your widgets and rules without notice. The Note Pin search lists only the scenes of the map's collection, and pins to scenes of another collection are left out when you paste. Pins that already link into another collection open that scene's copy in their own collection, if it has one.

**New Feature: Loot Roller**

- Roll random loot from your own item notes, gathered with Obsidian Bases. Add bases to a collection in Collection Settings → Loot; every note a base's views list is an item. The Bases core plugin must be turned on.
- Open the loot roller with L, the coin button in the toolbar or the command palette. It floats over the map; drag it anywhere and resize it from its edges. Each map remembers its place, size, views and latest roll.
- Tick the bases to roll from on the left, or open a base to pick single views. Roll one item or up to ten at once. An item in several ticked views counts once.
- Every item of the ticked views has an equal chance. Switch rarities on and off to roll, say, only Common and Uncommon items.
- Results show the item's price, description and the other columns of its view, under the names the base gives them. Click a result's source to open the item's note. Name the collection's currency in its settings and plain-number prices read as, say, "500 gold".
- Items with Type and Rarity properties show what each item is and colour it by rarity, like in games: Common, Uncommon in green, Rare in blue, Epic in purple and Legendary in orange.
- Hand items to your players: the eye button on an item shows it with its price in a large "Loot received" window at the top of the player view, easy to read from across the table. Show one item after another and they stack; players close the window by clicking outside it or pressing Escape.
- The History tab keeps every roll made in the collection, from any of its maps, with when and where it was rolled.
- Short tours with screenshots walk you through loot the first time you open the Loot settings, the loot roller and your first roll, and tooltips explain every control. An empty loot roller opens the Loot settings in one click.

### Improved

- Give maps without a grid one by eye: Grid alignment has a new Freehand tab that puts a token in a small patch of grid under your pointer. Zoom the map until the preview's cells match the map, then click to place the grid there. Switch between squares, pointy-top and flat-top hexes at any time, and nudge the placed grid with the arrow keys before you apply it.
- Settings → Getting started shows how many tutorials you finished or skipped, and Reset tutorials shows them all again. A tutorial you finish, skip or close with Escape stays hidden until you reset it.
- The laser pointer looks like a laser: a glowing beam with a bright core that narrows as it fades, and a round spot at the pointer. It stays visible on light maps, where the old one almost disappeared. Pick its colour and size in the Move tool's menu (the arrow next to it): eight colours that stay distinguishable for colour-blind players, with sky blue, blue and white clear for every kind of colour blindness. It keeps the same size on screen at every zoom level, and Atlas remembers your choice for every map.
- The asset manager opens where you left it: same tab, collection, folder, search, tag filter, sort and scroll position, also after restarting Obsidian. Opened over a map from another collection, it starts in that map's collection.
- Many open maps no longer crowd out your widgets. When the map tabs don't fit, they scroll sideways with the trackpad or mouse wheel, the active map stays in view, and a new button next to + lists all open maps.
- Every widget belongs to its collection: the widget settings of each scene list all widgets of the collection. Switch a widget on or off for a scene with the pin button, where it counts on its own, or on in every scene with the globe button, where all scenes share one value. A widget that is on in every scene can still be switched off in single scenes. Renaming or deleting a widget applies to the whole collection, and widgets your scenes already have join the list when you open them.
- Control timers from the keyboard: hold the timer's number key and press Space to start or pause it, or R to reset it. While you hold a widget's number key, Space and R no longer open the command palette and dice tray. Change both keys under Map hotkeys, where the widget shortcuts are now listed as Widgets.
- Atlas saves only the map hotkeys you change. Shortcuts you left alone follow Atlas' defaults, so they pick up better defaults in later versions, and a new default never takes a key you assigned yourself. Changed shortcuts show their default and a Restore default button, and a shortcut that lost its default key to one of yours says which.
- The pin button replaces the eye button in the widget settings: a widget you switch off keeps its value for when you switch it back on. Widgets you had hidden show as switched off.

### Fixed
- Encounters you save from tokens, in the asset manager or on a map, go to the collection you are browsing or the scene belongs to. Before, they always went to the default collection.
- Context menus are tidy again: rows have even spacing inside the rounded corners, and a menu no longer shows two divider lines in a row.

- Maps that were already open when Obsidian started now follow settings changes right away, such as trackpad or mouse navigation. Changing player view options on such a map no longer reverts settings you changed elsewhere.
- Mouse navigation no longer switches to trackpad behaviour on its own. Maps that were open when Obsidian started sometimes scrolled the map instead of zooming until you changed the setting again, and reloading Atlas during startup could reset the setting to trackpad.
- Hide and Show in a token's context menu now apply to all selected tokens, not only the one you right-clicked.
- Timers you share with players now show in the player view and count down with yours. Before, only counters showed.
- Images shown on the player view have rounded corners, and their close button is no longer covered by the widgets.
- Close an image on the player view by clicking beside it or pressing Escape in the player window.
- Widgets shared across a collection now show on every scene of the collection, including scenes moved into it while open. Before, adding a widget on such a scene could remove the shared widget from the whole collection.
- A scene you copy or move into another collection leaves its old collection's widgets behind and shows the new collection's instead.
- Pinned note previews reopen exactly where you pinned them and at the same size, also after reloading Obsidian. Before, a preview could come back tiny in the top-left corner. On a smaller screen a preview shrinks only as far as it has to, and returns to its pinned size on a larger one.
- Note previews always show above the map's toolbar, scene tabs and widgets instead of disappearing behind them, and below the DM dashboard.
- Note previews open right next to their pin while Obsidian's left sidebar is open. Before, they opened as far to the right of the pin as the sidebar is wide.
- Atlas follows changes you make to its files outside Atlas, in Obsidian's file explorer, your file manager or through a sync tool. A collection whose folder you rename keeps its scenes, tokens, encounters and settings under the new name. A scene you move into another collection's folder moves to that collection. Scenes, encounters and token art you copy into a collection folder show up in the asset manager, and ones you delete there disappear from it. Before, such changes could leave scenes missing or empty the asset manager.
- Changing a character's collection while editing it in the Token Creator no longer drops your other changes, and it now takes its tags and artwork along.
- A statblock note keeps showing its character's artwork when the artwork file is moved or renamed. Before, only the older `token-image` field followed, and the character could lose its statblock link.
- A scene whose map file was moved or renamed while it was closed opens with its fog of war, walls, lights, initiative and widgets. Before, it opened with only its tokens, pins, texts and drawings and lost the rest on the next save. Initiative portraits and dice rolls also follow moved token art now.
- On macOS, Cmd-hover previews of statblocks and notes open with Cmd only, no longer with Ctrl. Ctrl-click is a right click there, so dice clicked with Ctrl held did not roll. A statblock preview can no longer get stuck on screen, where releasing the key, reopening it or switching scenes would not close it.

### Important changes

- A collection's folder now always carries the collection's name, in Atlas and in Obsidian's file explorer alike. Renaming a collection in Atlas renames its folder, and renaming the folder renames the collection. On the first start, Atlas renames existing folders once to match their collections, for example `default` to `5e`. The default collection can be renamed like any other and stays your default collection.
- Grid alignment no longer offers the Quick tab: a single measurement placed the grid too unreliably. Align with Intersections, place the grid by eye with Freehand, or let Atlas detect it from the map image.

## 0.3.1 — Completes 0.3.0 with game systems, new pin icons and conditions

2026-09-24

### Important changes

- This release completes 0.3.0. Several finished features were missing from the 0.3.0 build and are included now. Pins that show no icon in 0.3.0 get their icons back.

### New

**New Feature: Game System Presets**

- Set a collection's measurement, conditions and token bars in one click in Collection Settings → Game System.
- Built-in presets: Daggerheart, D&D 5e, Old-School Essentials, Shadowdark, Pathfinder 2e, Call of Cthulhu 7th Edition and Cyberpunk RED.
- Save your own rules as a preset and use them in other collections.
- Choose the game system when you create a collection.

**New Feature: Place Pins**

- 65 new place icons for pins, from a world map down to a single room. Hover the location marker in the pin picker to open them.

**General**

- Share a counter or timer with every scene of a collection ("Share across collection" in Widget Settings).
- Tokens at 0 hit points turn grey and show a skull.
- Tag assets right from their card in the asset manager.
- Measure in yards.
- Conditions can carry a number, like Frightened 2 or Exhaustion 3.
- Apply a condition to several selected tokens at once.
- Join the Atlas community on Discord. The changelog and settings now link to it.

### Improved

- New Atlas app icon.
- New fantasy icons for map pins. Existing pins switch to the new icons on their own.
- Change a pin's icon in one click with Edit Pin.
- Conditions show as badges on the token, with a hover card that names them.
- Resource bars stay at a normal size and grow when you select a token.
- Resource bars animate when their value changes.
- Rotate and resize handles stay in place on rotated tokens.
- Smooth mouse-wheel zoom and a gentle stop after panning.
- Widgets float on their own cards above the map.
- Redesigned Link Statblock dialog with a statblock preview.
- Search and tag filters in the asset manager find assets in every folder.
- The asset manager sidebar floats over the library on narrow windows.
- Smoother animations for the asset manager, its dialogs, the pin menu and the command palette.
- Every panel closes with the same × button and shares the same rounded corners.
- Atlas shows its own tooltips instead of plain grey browser tooltips.
- Shift+Enter in the map switcher opens the map in both views.
- The End Combat button shows a white flag.

### Fixed

- The asset manager fits narrow and tall windows.
- Conditions show on the token at once.
- Every resource bar can be edited and has working +/- buttons.
- Tokens without a statblock no longer get a hit point bar of 100.
- Range band fields in Grid & Measure can be cleared and retyped.
- Sorting in the asset manager works.
- Map tags and character tags are kept apart.
- Tags created from an asset's right-click menu are saved.
- Manage Tags & Collections no longer reacts to Ctrl/Cmd shortcuts.

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
