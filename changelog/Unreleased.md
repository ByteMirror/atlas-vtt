## New

- Scene snapshots: save the state of a map (tokens, conditions, hit points, pins, fog, drawings, walls, lights, initiative and counters) under a name and reset the map to it later, for example to run the same encounter again with another group. Open the command palette and choose Scene snapshots: New snapshot saves the map right away, click a name to rename it, click a thumbnail to restore it, and right-click a snapshot to overwrite it with the map as it is now, rename it or delete it. Snapshots are saved next to the scene, follow it when it is renamed or moved, and are included when you export a collection.
- Press G on a map to open the map switcher: every open map is listed with a number, so press its number or type part of its name and hit Enter to jump to it. Shift+Enter also sends the player view to that map when it is open. Change the key in Settings → Atlas VTT → Map hotkeys.
- Copy, cut, paste and duplicate on maps. Select one or many tokens, drawings, texts or pins and press Ctrl/Cmd+C, Ctrl/Cmd+X or Ctrl/Cmd+D; Ctrl/Cmd+V pastes at the cursor, snapped to the grid with the group's layout intact, and works across open maps. Duplicate and Copy are also in the token right-click menu. Each paste, cut or duplicate is one undo step and is saved with the map.
- Spawn several copies of a token at once: in the asset manager, hover a token and type a number (for example 6), then double-click it or press Go. Right-click → Spawn Multiple offers quick counts too. On the map, hold Alt/Option while dragging tokens to drag out copies and leave the originals in place. A multi-token spawn is now a single undo step.
- Publish and update collections like mods. Exporting your own collection releases a new version with an author name and release notes. People who imported an earlier version import the new file and see exactly what changes: new, updated and removed assets, and which of their own changes are kept. When they changed something the update changes too, they choose per item whether to keep theirs or take the update. Older versions are recognised and only installed on request, the same version is reported as up to date, and a changed copy of a collection can be restored to its original.
- Share a collection you installed as a copy of its version, or publish it as your own collection under a new name.
- See how far a token travels while you drag it. A line runs from where the token started to the cell it will land in, and the distance shows in the middle of that path in the collection's units or range bands. Press Space during the drag to add a waypoint; the distance adds up along the whole path. Players see the measurement in the player view, except while you drag a hidden token.
- Choose how diagonals count on square grids in Collection Settings → Grid & Measure: every diagonal counts 1 (5e), diagonals alternate between 1 and 2 (5/10/5), or the exact distance. The measure tool and the drag distance both use it; hex grids always count hex steps.

## Improved

- Relative dates in the linked-note picker follow the app language and no longer depend on the moment library.
- An idle map no longer redraws on every display frame. Atlas now only draws when something on the map changes, so an open map costs almost no CPU or GPU while you are not interacting with it.
- The player view only copies a new frame when the map actually changed, instead of redrawing the map two extra times per frame.
- Map cards in the asset manager show small thumbnails instead of decoding the full map image.
- Delete and Backspace on a map now also remove selected texts and pins, the same objects Cut removes.
- Collection imports and exports keep their dialog open with the result until you close it, instead of disappearing before you could read it.
- Switching between open maps is much faster and no longer flashes a loading screen. The previous map stays on screen until the next one is ready and then gently crossfades into it (in the player view too, when you send it another map), recently viewed map images stay decoded so switching back is instant, and the loading screen only appears for maps that take a moment to load.
- Images shown on the player view fade in and settle into place, crossfade when you show another image, and fade out when closed, instead of popping in and out.
- Token controls grow with the token, like in Owlbear Rodeo. Hit point and secondary resource bars, their +/- buttons, nameplates, condition markers and the resize and rotate handles now keep their proportions to the token: large and gargantuan creatures get controls to match their size instead of tiny ones, and they grow live while you resize a token.

## Fixed

- Memory no longer grows with every scene switch. Grids, tokens, pins, labels and their controls now release their drawing data when they are rebuilt or removed; before, a hex or dashed grid could leave tens of megabytes behind per switch.
- Reloading Obsidian with the player view open no longer leaves the old player window running in the background. Each of those windows kept a full copy of the previous Obsidian session in memory.
- Token artwork from scenes you left is released when another scene loads.
- Closing the map shown in the player view no longer keeps that map in memory; players keep seeing the last frame.
- The player view keeps the initiative tracker visibility of the map it shows. Opening another map where the tracker is open no longer reveals it to players.
- Widgets in the player view always come from the map being shown. Opening another map no longer changes the counters players see, and presenting a new map now shows its widgets.
- Pinned note previews are saved with their map. Switching to another scene and back, reopening the map or restarting Obsidian brings them back where you moved and resized them, scrolled to where you were reading, with the cursor where you left it and in the same reading or editing mode. Opening the asset manager only hides them for a moment, and only the close button closes them for good.
- Importing a collection the vault already has no longer stops silently as already up to date.
- Importing a collection whose name another collection already uses asks for a new name instead of creating two collections with the same name, and creating a collection with an existing name no longer replaces the other one.
- Collection updates now also update the collection's token artwork in the shared assets folder.
- Imports check every file against its checksum and refuse damaged files and files that would land outside Atlas's folder. An import that fails halfway undoes what it wrote, and every file it replaces or removes is backed up first.
- Exporting a collection lists referenced files that no longer exist instead of leaving them out silently.
- A token's own "Show Nameplate" setting now stays as you set it. Linking or unlinking a statblock no longer turns it on or off, so the nameplate still shows after reopening the map or importing its collection into another vault, even when the map hides nameplates. A newly linked token therefore shows its name only when the map shows all nameplates or you turn on "Show Nameplate" for it.
- Ctrl/Cmd no longer reopens a note or statblock preview from a map you have left. After switching scenes, following a link or moving to another map or Obsidian tab, the hovered pin or token is forgotten.
- Tokens that share an image show their number badges as soon as they are spawned. Before, the numbers only appeared after you moved a token.
- Dice roll cards and the roll log show a token's portrait the way it looks on the map: with its ring and ring colour, and uncropped for tokens without a ring.
- Encounters keep the ring setting of their tokens. Tokens with the ring turned off no longer get one when you spawn an encounter made from them in the asset manager, and the encounter card previews show each token with or without its ring.
