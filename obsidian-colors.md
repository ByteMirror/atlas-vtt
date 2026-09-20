# Obsidian CSS Variables Reference

Current as of **Obsidian 1.13** (verified live against 1.13.7 on 2026-09-19).
Source: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables

Atlas VTT styles rely on these variables so the plugin follows the user's theme.
Prefer semantic variables (`--text-muted`, `--background-modifier-hover`) over raw
base colours. For tinted colours use `color-mix()`, never the removed `-rgb` variables.

## Deprecated in 1.13 — do not use

All RGB and HSL channel variables are deprecated. Some still resolve today, several
never existed and silently break the declaration they appear in.

| Removed / deprecated | Status in 1.13.7 | Use instead |
|---|---|---|
| `--color-accent-rgb`, `--interactive-accent-rgb` | **unset** (never official) | `color-mix(in oklch, var(--interactive-accent) 30%, transparent)` |
| `--background-modifier-active` | **unset** (never official) | `--background-modifier-active-hover` |
| `--mono-rgb-0`, `--mono-rgb-100` | deprecated | `color-mix(in oklch, var(--mono-100) 18%, transparent)` |
| `--color-red-rgb` … `--color-pink-rgb` | deprecated | `color-mix(in oklch, var(--color-red) 20%, transparent)` |
| `--interactive-accent-hsl`, `--color-accent-hsl` | deprecated | `--interactive-accent`, `--color-accent` |
| `--background-modifier-error-rgb`, `--background-modifier-success-rgb` | deprecated | `--background-modifier-error`, `--background-modifier-success` |
| `--text-highlight-bg-rgb` | deprecated | `--text-highlight-bg` |

Obsidian itself now composes tints this way, e.g. `--background-modifier-hover` is
`color-mix(in oklch, white 6.7%, transparent)` in the dark theme.

## Foundations

### Base colours

| Variable | Light | Dark |
|---|---|---|
| `--color-base-00` | `#ffffff` | `#1e1e1e` |
| `--color-base-05` | `#fcfcfc` | `#212121` |
| `--color-base-10` | `#fafafa` | `#242424` |
| `--color-base-20` | `#f6f6f6` | `#262626` |
| `--color-base-25` | `#e3e3e3` | `#2a2a2a` |
| `--color-base-30` | `#e0e0e0` | `#363636` |
| `--color-base-35` | `#d4d4d4` | `#3f3f3f` |
| `--color-base-40` | `#bdbdbd` | `#555555` |
| `--color-base-50` | `#ababab` | `#666666` |
| `--color-base-60` | `#707070` | `#999999` |
| `--color-base-70` | `#5a5a5a` | `#bababa` |
| `--color-base-100` | `#222222` | `#dadada` |

### Accent

| Variable | Default | Notes |
|---|---|---|
| `--accent-h` | `258` | Hue |
| `--accent-s` | `88%` | Saturation |
| `--accent-l` | `66%` | Lightness |
| `--color-accent` | `hsl(258, 88%, 66%)` | The accent colour |
| `--color-accent-1` | lighter accent | Hover / highlight tint |
| `--color-accent-2` | lightest accent | Stronger highlight tint |

### Extended colours

`--color-red`, `--color-orange`, `--color-yellow`, `--color-green`, `--color-cyan`,
`--color-blue`, `--color-purple`, `--color-pink`

| Variable | Light | Dark |
|---|---|---|
| `--color-red` | `#e93147` | `#fb464c` |
| `--color-orange` | `#ec7500` | `#e9973f` |
| `--color-yellow` | `#e0ac00` | `#e0de71` |
| `--color-green` | `#08b94e` | `#44cf6e` |
| `--color-cyan` | `#00bfbc` | `#53dfdd` |
| `--color-blue` | `#086ddd` | `#027aff` |
| `--color-purple` | `#7852ee` | `#a882ff` |
| `--color-pink` | `#d53984` | `#fa99cd` |

### Black and white

| Variable | Light | Dark |
|---|---|---|
| `--mono-0` | `white` | `black` |
| `--mono-100` | `black` | `white` |

### Surfaces

| Variable | Description |
|---|---|
| `--background-primary` | Primary background (dark: `#1c1c1c`) |
| `--background-primary-alt` | Surfaces on top of primary |
| `--background-secondary` | Secondary background (dark: `#282828`) |
| `--background-secondary-alt` | Surfaces on top of secondary |
| `--background-modifier-hover` | Hovered elements |
| `--background-modifier-active-hover` | Active hovered elements (accent tint) |
| `--background-modifier-border` | Border colour |
| `--background-modifier-border-hover` | Border colour on hover |
| `--background-modifier-border-focus` | Border colour on focus |
| `--background-modifier-error` | Error background |
| `--background-modifier-error-hover` | Error background on hover |
| `--background-modifier-success` | Success background |
| `--background-modifier-message` | Message background |
| `--background-modifier-form-field` | Form field background |

### Interactive

| Variable | Description |
|---|---|
| `--interactive-normal` | Standard interactive element background |
| `--interactive-hover` | Standard interactive element on hover |
| `--interactive-accent` | Accented interactive element |
| `--interactive-accent-hover` | Accented interactive element on hover |

### Text

| Variable | Description |
|---|---|
| `--text-normal` | Normal text |
| `--text-muted` | Muted text |
| `--text-faint` | Faint text |
| `--text-on-accent` | Text on accent when accent is dark |
| `--text-on-accent-inverted` | Text on accent when accent is light |
| `--text-success` | Success text |
| `--text-warning` | Warning text |
| `--text-error` | Error text |
| `--text-accent` | Accent text |
| `--text-accent-hover` | Accent text on hover |
| `--text-selection` | Selected text background |
| `--text-highlight-bg` | Highlighted text background |
| `--caret-color` | Caret |

### Spacing

Obsidian lays out on a 4px grid. `--size-2-*` is the 2px sub-grid.

| Variable | Value | | Variable | Value |
|---|---|---|---|---|
| `--size-2-1` | 2px | | `--size-4-5` | 20px |
| `--size-2-2` | 4px | | `--size-4-6` | 24px |
| `--size-2-3` | 6px | | `--size-4-8` | 32px |
| `--size-4-1` | 4px | | `--size-4-9` | 36px |
| `--size-4-2` | 8px | | `--size-4-12` | 48px |
| `--size-4-3` | 12px | | `--size-4-16` | 64px |
| `--size-4-4` | 16px | | `--size-4-18` | 72px |

Atlas `$spacing-*` tokens (4/8/12/16/24/32) sit on this grid.

### Radiuses

| Variable | Value | Atlas token |
|---|---|---|
| `--radius-s` | 4px | `$radius-s` |
| `--radius-m` | 8px | `$radius-m`, `$radius-l` |
| `--radius-l` | 12px | `$radius-xl` |
| `--radius-xl` | 24px | `$radius-2xl` |

### Typography

| Variable | Value (default theme) | Use |
|---|---|---|
| `--font-ui-smaller` | 12px | Captions, counts, shortcuts |
| `--font-ui-small` | 13px | Labels, body UI text |
| `--font-ui-medium` | 15px | Section titles |
| `--font-ui-large` | 20px | Modal titles |
| `--font-smallest`, `--font-smaller`, `--font-small`, `--font-text-size` | editor-relative | Editor content only |
| `--font-interface`, `--font-text`, `--font-monospace` | | Families |
| `--font-thin` … `--font-black` | 100 … 900 | Weights (`--font-medium` 500, `--font-semibold` 600) |
| `--line-height-normal`, `--line-height-tight` | | Line heights |

### Icons

| Variable | Value |
|---|---|
| `--icon-xs` / `--icon-s` / `--icon-m` / `--icon-l` / `--icon-xl` | 14 / 16 / 18 / 18 / 32px |
| `--icon-*-stroke-width` | 2 / 2 / 1.75 / 1.75 / 1.25px |
| `--icon-size`, `--icon-stroke` | Shorthand size and stroke |
| `--icon-color`, `--icon-color-hover`, `--icon-color-active`, `--icon-color-focused` | Icon colours |
| `--icon-opacity`, `--icon-opacity-hover`, `--icon-opacity-active` | 0.85 / 1 / 1 |
| `--clickable-icon-radius` | 8px |

### Borders, layers, shadows

| Variable | Value |
|---|---|
| `--border-width` | 1px |
| `--layer-cover` / `--layer-sidedock` / `--layer-status-bar` | 5 / 10 / 15 |
| `--layer-popover` / `--layer-slides` / `--layer-modal` | 30 / 45 / 50 |
| `--layer-notice` / `--layer-menu` / `--layer-tooltip` / `--layer-dragged-item` | 60 / 65 / 70 / 80 |
| `--shadow-s` | Three-layer shadow for menus and popovers |
| `--shadow-l` | Three-layer shadow for modals |

## Components

| Variable | Description |
|---|---|
| `--button-radius` | Button radius (8px) |
| `--input-height`, `--input-radius`, `--input-font-weight`, `--input-border-width` | Text inputs (30px / 8px) |
| `--input-shadow`, `--input-shadow-hover` | Input shadows |
| `--modal-background`, `--modal-border-color`, `--modal-border-width`, `--modal-radius` | Modals (radius 24px) |
| `--modal-width`, `--modal-height`, `--modal-max-width`, `--modal-max-height`, `--modal-max-width-narrow` | Modal sizing |
| `--menu-background`, `--menu-border-color`, `--menu-border-width`, `--menu-radius`, `--menu-shadow` | Context menus (radius 8px) |
| `--popover-width`, `--popover-height`, `--popover-max-height`, `--popover-font-size` | Hover popovers |
| `--nav-item-background-hover`, `--nav-item-background-active`, `--nav-item-color`, `--nav-item-color-active` | File explorer style nav items |
| `--tab-background-active`, `--tab-text-color`, `--tab-text-color-active` | Workspace tabs |
| `--divider-color`, `--divider-width` | Dividers |
| `--scrollbar-thumb-bg`, `--scrollbar-active-thumb-bg`, `--scrollbar-bg` | Scrollbars |
| `--checkbox-radius`, `--checkbox-size`, `--checkbox-color`, `--checkbox-border-color` | Checkboxes |
| `--toggle-radius`, `--toggle-width`, `--toggle-thumb-color` | Toggles |
| `--slider-thumb-radius`, `--slider-track-background` | Sliders |
| `--dialog-width`, `--dialog-max-width` | Dialogs |
