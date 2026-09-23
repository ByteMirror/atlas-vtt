## Improved

- Relative dates in the linked-note picker follow the app language and no longer depend on the moment library.
- An idle map no longer redraws on every display frame. Atlas now only draws when something on the map changes, so an open map costs almost no CPU or GPU while you are not interacting with it.
- The player view only copies a new frame when the map actually changed, instead of redrawing the map two extra times per frame.
- Map cards in the asset manager show small thumbnails instead of decoding the full map image.

## Fixed

- Memory no longer grows with every scene switch. Grids, tokens, pins, labels and their controls now release their drawing data when they are rebuilt or removed; before, a hex or dashed grid could leave tens of megabytes behind per switch.
- Reloading Obsidian with the player view open no longer leaves the old player window running in the background. Each of those windows kept a full copy of the previous Obsidian session in memory.
- Token artwork from scenes you left is released when another scene loads.
- Closing the map shown in the player view no longer keeps that map in memory; players keep seeing the last frame.
- The player view keeps the initiative tracker visibility of the map it shows. Opening another map where the tracker is open no longer reveals it to players.
- Widgets in the player view always come from the map being shown. Opening another map no longer changes the counters players see, and presenting a new map now shows its widgets.
- Pinned note previews are saved with their map. Switching to another scene and back, reopening the map or restarting Obsidian brings them back where you moved and resized them. Opening the asset manager only hides them for a moment, and only the close button closes them for good.
