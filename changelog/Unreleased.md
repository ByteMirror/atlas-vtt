## New

- Copy, cut, paste and duplicate on maps. Select one or many tokens, drawings, texts or pins and press Ctrl/Cmd+C, Ctrl/Cmd+X or Ctrl/Cmd+D; Ctrl/Cmd+V pastes at the cursor, snapped to the grid with the group's layout intact, and works across open maps. Duplicate and Copy are also in the token right-click menu. Each paste, cut or duplicate is one undo step and is saved with the map.
- Spawn several copies of a token at once: in the asset manager, hover a token and type a number (for example 6), then double-click it or press Go. Right-click → Spawn Multiple offers quick counts too. On the map, hold Alt/Option while dragging tokens to drag out copies and leave the originals in place. A multi-token spawn is now a single undo step.
- Publish and update collections like mods. Exporting your own collection releases a new version with an author name and release notes. People who imported an earlier version import the new file and see exactly what changes: new, updated and removed assets, and which of their own changes are kept. When they changed something the update changes too, they choose per item whether to keep theirs or take the update. Older versions are recognised and only installed on request, the same version is reported as up to date, and a changed copy of a collection can be restored to its original.
- Share a collection you installed as a copy of its version, or publish it as your own collection under a new name.
- Scene snapshots: save the state of a map (tokens, conditions, hit points, pins, fog, drawings, walls, lights, initiative and counters) under a name and reset the map to it later, for example to run the same encounter again with another group. Open the command palette and choose Scene snapshots: each snapshot shows a thumbnail; click one to restore it, or rename and delete it from its card. Snapshots are saved next to the scene, follow it when it is renamed or moved, and are included when you export a collection.

## Improved

- Relative dates in the linked-note picker follow the app language and no longer depend on the moment library.
- An idle map no longer redraws on every display frame. Atlas now only draws when something on the map changes, so an open map costs almost no CPU or GPU while you are not interacting with it.
- The player view only copies a new frame when the map actually changed, instead of redrawing the map two extra times per frame.
- Map cards in the asset manager show small thumbnails instead of decoding the full map image.
- Delete and Backspace on a map now also remove selected texts and pins, the same objects Cut removes.
- Collection imports and exports keep their dialog open with the result until you close it, instead of disappearing before you could read it.

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
