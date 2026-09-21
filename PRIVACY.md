# Privacy and network use

Atlas VTT is an offline plugin. Maps, tokens, notes, audio and settings are stored in your vault and never leave your computer.

- No accounts, no telemetry, no analytics, no ads.
- No code is downloaded or executed from the internet, and the plugin does not update itself.

## The only network access

If you set a token or map background to an `http://` or `https://` image URL, or copy an image that a note embeds from an external URL, that image is downloaded from the address in question. Images stored in your vault cause no network traffic.

PixiJS, the bundled rendering library, contains download URLs for optional texture transcoders (`files.pixijs.download`). They are only requested for KTX or Basis compressed textures, which Atlas VTT does not use.

## Files outside the vault

Atlas VTT does not read or write files outside your vault.

## Code execution

When the optional [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin is installed, Atlas VTT renders creature statblocks with that plugin's layouts. Layouts can contain small JavaScript callbacks (for example to format a modifier). Atlas VTT runs those callbacks exactly as Fantasy Statblocks does. They come only from Fantasy Statblocks' own layout data on your computer — never from note content or the internet. That includes layouts you imported from someone else, so only import layouts you trust, as you would for Fantasy Statblocks itself. Without Fantasy Statblocks installed, no such code runs.

## Issue reports

The **Report an issue** command and **Settings → Atlas VTT → Help and feedback** open a form inside Obsidian. Choosing **Open GitHub issue** opens a pre-filled issue form in your browser; nothing is sent until you submit it there with your own GitHub account. The pre-filled text contains what you typed plus the Atlas, Obsidian and Electron versions, your operating system and interface language, the active theme, and optionally the names and versions of enabled community plugins and recent Atlas error messages. Both optional parts can be turned off in the form and are shown before you continue. It never contains vault names, file paths, note contents or map data. **Copy report** places the same text on the clipboard instead. See [docs/reporting-issues.md](docs/reporting-issues.md).

## Clipboard and local storage

The clipboard is written only when you choose a copy action (for example "Copy image"). Interface state such as the music queue is kept in local storage on your device.
