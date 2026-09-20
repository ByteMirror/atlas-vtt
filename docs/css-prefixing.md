# CSS Prefixing Guidelines for Atlas VTT

## Overview

To prevent CSS conflicts with Obsidian themes and the Obsidian UI, all Atlas VTT CSS classes use the `atlas-` prefix. This ensures our styles only apply to our components and don't interfere with Obsidian's native styling.

## Implementation

### 1. Class Name Prefixing
All CSS class names in the plugin are prefixed with `atlas-`:
- `asset-manager-modal` → `atlas-asset-manager-modal`
- `tab-button` → `atlas-tab-button`
- `active` → `atlas-active`

### 2. CSS Namespace Wrapper
All component styles are wrapped in the `.atlas-vtt-root` namespace in `styles/main.scss`:
```scss
.atlas-vtt-root {
  @import '../src/app/react/components/command-palette.scss';
  @import '../src/app/packages/components/asset-manager/asset-manager.scss';
  // ... other imports
}
```

### 3. Generic Element Selectors
Generic element selectors (h1-h6, p, span, button, etc.) are scoped using the `&` parent selector:
```scss
.atlas-some-component {
  & h3 {
    // styles for h3 within this component
  }
  
  & input[type="checkbox"] {
    // styles for checkboxes within this component
  }
}
```

### 4. Root Component Classes
All root React components include the `atlas-vtt-root` class:
```tsx
<div className="atlas-vtt-root atlas-asset-manager-modal">
  {/* component content */}
</div>
```

## Guidelines for New Development

1. **Always use the `atlas-` prefix** for new CSS classes
2. **Never use generic element selectors** without scoping them
3. **Add `atlas-vtt-root`** class to new root-level components
4. **Use Obsidian CSS variables** for colors and theming
5. **Test with different Obsidian themes** to ensure no conflicts

## Examples

### Good ✅
```scss
.atlas-my-component {
  background: var(--background-primary);
  
  & button {
    color: var(--text-normal);
  }
}

.atlas-my-button {
  padding: 0.5rem;
}
```

### Bad ❌
```scss
.my-component {  // Missing atlas- prefix
  background: white;  // Not using CSS variables
}

button {  // Generic selector without scoping
  padding: 0.5rem;
}
```

## Benefits

1. **No Theme Conflicts**: Styles don't affect Obsidian's UI
2. **Theme Compatibility**: Works with any Obsidian theme
3. **Maintainable**: Clear naming convention
4. **Future-proof**: Easy to identify Atlas VTT styles