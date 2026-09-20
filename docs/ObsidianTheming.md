# Obsidian CSS Variables Integration Guide

This guide explains how Atlas-VTT integrates with Obsidian's theming system using CSS variables.

## Obsidian CSS Variables

Obsidian exposes a comprehensive set of CSS variables for theme customization. These variables change automatically when the user switches between light and dark mode or changes themes.

### Core Color & Surface Tokens

| Visual purpose                   | Obsidian variable                      | Atlas Tailwind usage          |
|----------------------------------|----------------------------------------|-------------------------------|
| Primary surface                  | `--background-primary`                 | `bg-surface`                  |
| Secondary surface / dropdown     | `--background-secondary`               | `bg-surface-secondary`        |
| Hover highlight                  | `--background-modifier-hover`          | `hover:bg-surface-hover`      |
| Active/selected accent           | `--interactive-accent`                 | `bg-surface-accent`           |
| Accent on hover/focus            | `--interactive-accent-hover`           | `hover:bg-surface-accent-hover`|
| Border/outlines                  | `--background-modifier-border`         | `border-border` or `border`   |
| Text normal                      | `--text-normal`                        | `text-text`                   |
| Muted text                       | `--text-muted`                         | `text-text-muted`             |
| Faint/inactive text              | `--text-faint`                         | `text-text-faint`             |

### Border Radius & Spacing

| Component piece                  | Obsidian variable                      | Atlas Tailwind usage          |
|----------------------------------|----------------------------------------|-------------------------------|
| Button radius                    | `--radius-s`                           | `rounded-ob`                  |
| Box shadows                      | `--background-modifier-box-shadow`     | `shadow-ob`                   |

## Using in Code

Our Tailwind configuration (`tailwind.config.mts`) has been extended with semantic tokens that map to Obsidian's CSS variables:

```jsx
// Instead of hardcoded colors:
<div className="bg-zinc-900 text-white border-zinc-800 rounded-lg">...</div>

// Use our theme-aware utilities:
<div className="bg-surface text-text border rounded-ob">...</div>
```

This ensures our UI looks native in both light and dark mode, and adapts to any custom themes the user has applied to Obsidian.

## Utility Functions

We've created a utility function `cn()` (imported from `src/utils/cn`) that helps combine dynamic class names:

```jsx
import { cn } from "src/utils/cn";

const MyComponent = ({ isActive }) => (
  <button 
    className={cn(
      "rounded-ob p-2", 
      isActive 
        ? "bg-surface-accent text-text" 
        : "bg-surface hover:bg-surface-hover"
    )}
  >
    Click me
  </button>
);
```

## Direct Variable Usage

If you need to use an Obsidian CSS variable that isn't configured in our Tailwind config, you can use the arbitrary value syntax:

```jsx
<div className="bg-[var(--some-obsidian-variable)]">...</div>
```

## Testing Themes

When developing UI components, test with both light and dark mode in Obsidian to ensure your components look good in both themes.

## Reference

For a complete list of Obsidian CSS variables, see:
- [Obsidian Developer Docs - CSS Variables](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Reference/CSS%20variables/CSS%20variables.md) 