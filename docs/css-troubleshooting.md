# CSS Troubleshooting Guide

## Issue: UI Elements Look Broken After CSS Prefixing

If UI elements appear broken or unstyled, it's likely due to mismatched class names between SCSS and TSX files.

### Quick Fix Checklist

1. **Verify Class Names Match**
   - Every class in SCSS files should have `atlas-` prefix
   - Every className in TSX files should use the same `atlas-` prefix
   
2. **Common Patterns to Check**
   ```tsx
   // ❌ Wrong
   className="tab-button active"
   
   // ✅ Correct
   className="atlas-tab-button atlas-active"
   ```

3. **Dynamic Classes**
   ```tsx
   // ❌ Wrong
   className={`tab-button ${isActive ? 'active' : ''}`}
   
   // ✅ Correct
   className={`atlas-tab-button ${isActive ? 'atlas-active' : ''}`}
   ```

4. **cn() Function Usage**
   ```tsx
   // ❌ Wrong
   className={cn("tab-button", isActive && "active")}
   
   // ✅ Correct
   className={cn("atlas-tab-button", isActive && "atlas-active")}
   ```

### Debugging Steps

1. **Check Browser DevTools**
   - Inspect the element
   - Look for the applied classes
   - Verify they start with `atlas-`

2. **Search for Missing Prefixes**
   ```bash
   # Find classes without atlas- prefix in SCSS
   grep -E "^\s*\." src/**/*.scss | grep -v "atlas-"
   
   # Find className usage without atlas- prefix
   grep -E 'className="[^"]*"' src/**/*.tsx | grep -v "atlas-"
   ```

3. **Common Missed Classes**
   - Utility classes: `active`, `selected`, `disabled`, `open`, `expanded`
   - Generic names: `button`, `input`, `container`, `wrapper`
   - State classes: `hover`, `focus`, `error`

### Prevention

1. Always use `atlas-` prefix for new classes
2. Use semantic, component-specific names
3. Test with different Obsidian themes
4. Run a build after CSS changes to catch errors early