## New

- Copy, cut, paste and duplicate on maps. Select one or many tokens, drawings, texts or pins and press Ctrl/Cmd+C, Ctrl/Cmd+X or Ctrl/Cmd+D; Ctrl/Cmd+V pastes at the cursor, snapped to the grid with the group's layout intact, and works across open maps. Duplicate and Copy are also in the token right-click menu. Each paste, cut or duplicate is one undo step and is saved with the map.
- Spawn several copies of a token at once: in the asset manager, hover a token and type a number (for example 6), then double-click it or press Go. Right-click → Spawn Multiple offers quick counts too. On the map, hold Alt/Option while dragging tokens to drag out copies and leave the originals in place. A multi-token spawn is now a single undo step.

## Improved

- Relative dates in the linked-note picker follow the app language and no longer depend on the moment library.
- An idle map no longer redraws on every display frame. Atlas now only draws when something on the map changes, so an open map costs almost no CPU or GPU while you are not interacting with it.
- The player view only copies a new frame when the map actually changed, instead of redrawing the map two extra times per frame.
- Map cards in the asset manager show small thumbnails instead of decoding the full map image.
- Delete and Backspace on a map now also remove selected texts and pins, the same objects Cut removes.

## Fixed

- Memory no longer grows with every scene switch. Grids, tokens, pins, labels and their controls now release their drawing data when they are rebuilt or removed; before, a hex or dashed grid could leave tens of megabytes behind per switch.
- Reloading Obsidian with the player view open no longer leaves the old player window running in the background. Each of those windows kept a full copy of the previous Obsidian session in memory.
- Token artwork from scenes you left is released when another scene loads.
- Closing the map shown in the player view no longer keeps that map in memory; players keep seeing the last frame.
- The player view keeps the initiative tracker visibility of the map it shows. Opening another map where the tracker is open no longer reveals it to players.
- Widgets in the player view always come from the map being shown. Opening another map no longer changes the counters players see, and presenting a new map now shows its widgets.
