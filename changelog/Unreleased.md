## New

- Click a selected token's HP or stress bar to type a value directly: `15` sets the current value, `15/40` sets current and maximum, `+5` or `-3` adjusts it. Enter applies, Escape cancels.
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

## Improved

- Exporting a collection now packs everything it needs: scenes with their map files, backgrounds and previews, token art and thumbnails, encounters, and the Fantasy Statblocks notes tokens link to together with their artwork, plus the collection's tags and settings. Importing restores all of it into the new vault with working scene previews and statblock links, and a progress dialog shows what is being packed or written.
- Hover highlights in the asset manager, dropdown menus and context menus now appear and disappear instantly, and every item also shows a pressed highlight while you click it.
- Deleting a token asset now tells you which encounters and maps still use it, removes it from them on confirm, and deletes encounters that would be left empty.
- Fantasy Statblocks artwork now opens in the same token import cards as uploaded images, with crop controls, tags for selected tokens, and individual or global ring choices.

- Dice roll toasts now look like a game HUD: a large glowing result, a ringed portrait, an accent-tinted ability label and knotwork corners. Natural 20s glow gold and natural 1s glow crimson, and the number lands with the reveal chime.
- The asset manager stays quick with large libraries: it keeps its index in memory, shows small thumbnails instead of full-size token art (existing tokens get theirs in the background), and only renders the cards on screen.
- Fantasy Statblocks imports now open inside the existing token creator. Filter by system/layout and choose the Atlas ring for all tokens or individually. Tokens imported without a ring retain their full artwork on the map.

- Grid auto-detect now lines up across the whole map instead of drifting towards the edges, finds faint grids on busy art, and no longer reports a grid on maps that have none or picks the wrong grid type. The result tells you how much of the map the grid was found on.
- Grids draw in black or white, whichever stands out against the map image, instead of cyan. Maps still on the old cyan default switch over automatically; pick Auto in the grid colour swatches to return to this after choosing a colour.

## Fixed

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
