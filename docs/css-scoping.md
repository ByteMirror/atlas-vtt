# CSS Scoping for Atlas VTT

## Overview

Atlas VTT uses a CSS namespace strategy to prevent style conflicts with Obsidian themes and other plugins. All Atlas VTT styles are scoped under the `.atlas-vtt-root` class.

## Implementation

### 1. Main SCSS Structure

The main stylesheet at `styles/main.scss` wraps all component styles within the `.atlas-vtt-root` selector:

```scss
.atlas-vtt-root {
  // All Atlas VTT styles go here
  @import 'component-styles';
}
```

### 2. Component Root Classes

All React components that render at the root level must include the `atlas-vtt-root` class:

```tsx
// Example: UIRoot.tsx
<div className="atlas-vtt-root atlas-ui">
  {/* Component content */}
</div>

// Example: AssetManager.tsx
<div className="atlas-vtt-root asset-manager-modal">
  {/* Modal content */}
</div>
```

### 3. Required Root Components

The following components have been updated to include the `atlas-vtt-root` class:

- `UIRoot.tsx` - Main UI container
- `AtlasViewRoot.tsx` - View container
- `AssetManager.tsx` - Asset manager modal
- `TokenCreator.tsx` - Token creator modal
- `TagManager.tsx` - Tag manager modal
- `EditAssetTagsModal.tsx` - Edit tags modal
- `CreateSceneModal.tsx` - Create scene modal
- `CommandPalette.tsx` - Command palette overlay

### 4. Exceptions

Some styles need to remain outside the namespace to properly target Obsidian's workspace structure:

- `.workspace-leaf-content[data-type="atlas-vtt"]` - Atlas VTT view styles
- `.workspace-leaf-content[data-type="atlas-vtt-player"]` - Player view styles
- `.atlas-player-view` - Player-specific UI hiding rules

## Benefits

1. **No Theme Conflicts**: Atlas VTT styles won't interfere with Obsidian themes
2. **Isolated Styles**: All plugin styles are contained within the namespace
3. **Single CSS File**: Still exports as a single `styles.css` file
4. **Maintainable**: Easy to add new components - just ensure root elements have the class

## Adding New Components

When creating new root-level components (modals, overlays, etc.), always include the `atlas-vtt-root` class:

```tsx
return (
  <div className="atlas-vtt-root your-component-class">
    {/* Your component content */}
  </div>
);
```

## CSS Variables

Atlas VTT uses Obsidian's CSS variables for theming consistency:
- `--background-primary`
- `--text-normal`
- `--interactive-accent`
- etc.

This ensures the plugin adapts to the user's chosen Obsidian theme while keeping styles isolated.