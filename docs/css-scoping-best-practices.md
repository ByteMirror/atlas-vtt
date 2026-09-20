# CSS Scoping Best Practices for Atlas VTT

## Current Implementation

Atlas VTT uses a multi-layered approach to prevent CSS conflicts with Obsidian:

### 1. Root Container Class
All Atlas VTT views add the `.atlas-vtt-plugin` class to their container:
```typescript
containerEl.addClass('atlas-vtt-plugin');
```

### 2. CSS Namespace
All styles are wrapped inside `.atlas-vtt-plugin` in `main.scss`:
```scss
.atlas-vtt-plugin {
  // All component styles are imported here
  @import '../src/app/react/components/command-palette.scss';
  @import '../src/app/packages/components/asset-manager/asset-manager.scss';
  // ... etc
}
```

### 3. Class Name Prefixing
All CSS classes use the `atlas-` prefix:
- `atlas-asset-manager-modal`
- `atlas-tab-button`
- `atlas-active`
- etc.

### 4. Scoped Generic Selectors
Generic element selectors are scoped using the `&` parent selector:
```scss
.atlas-some-component {
  & h3 {
    // Only affects h3 within this component
  }
  
  & button {
    // Only affects buttons within this component
  }
}
```

## Why This Approach?

1. **Complete Isolation**: The `.atlas-vtt-plugin` wrapper ensures our styles only apply to our plugin's elements
2. **No Global Pollution**: Generic selectors can't affect Obsidian's UI
3. **Theme Compatibility**: Uses Obsidian's CSS variables for colors and styling
4. **Maintainable**: Clear naming convention and structure

## Guidelines for New Development

### Do's ✅
- Always add `.atlas-vtt-plugin` class to root containers
- Use `atlas-` prefix for all new CSS classes
- Use Obsidian's CSS variables (e.g., `var(--text-normal)`)
- Scope generic selectors with `&`
- Test with different Obsidian themes

### Don'ts ❌
- Never use global selectors
- Don't hard-code colors
- Avoid `!important` unless absolutely necessary
- Don't style Obsidian's core classes directly

## Example Structure

```scss
// In component SCSS file
.atlas-my-component {
  background: var(--background-primary);
  color: var(--text-normal);
  
  & .atlas-my-header {
    font-size: 1.2rem;
    
    & h3 {
      // Scoped to only affect h3 within .atlas-my-header
      margin: 0;
    }
  }
  
  & button {
    // Only affects buttons within this component
    background: var(--interactive-accent);
  }
}
```

## Shadow DOM / iframe (Future Consideration)

For heavy third-party widgets or complete isolation needs, consider:
- Shadow DOM for web components
- iframes for complete sandboxing
- Currently not needed but available as options

## Testing

1. Load your plugin with different Obsidian themes
2. Check that Obsidian's settings menu isn't affected
3. Verify your UI adapts to theme changes
4. Use browser DevTools to inspect applied styles