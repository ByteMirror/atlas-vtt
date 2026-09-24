## New

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

## Improved

- Improved Performance for Atlas Maps. They use much less CPU and GPU
- The player view copies a new frame only when the map changes.
- Switching maps is much faster now.
- Improved animations throughout Atlas
- Improved performance of Maps tab in Asset Manager
- Token controls grow with the token. Large creatures get large bars, nameplates and handles.
- Delete and Backspace also remove selected texts and pins.
- Import and export dialogs stay open and show the result until you close them.
- Dates in the note picker use your app language.

## Fixed

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
