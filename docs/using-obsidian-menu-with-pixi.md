# Using Obsidian's Native Menu with Pixi.js Objects

This document explains how to integrate Obsidian's native context menu system with Pixi.js canvas objects in the Atlas VTT plugin.

## Overview

Instead of using a custom React-based context menu, you can leverage Obsidian's built-in `Menu` class to create native context menus that match the look and feel of Obsidian.

## Implementation Steps

### 1. Import the Menu class

```typescript
import { Menu } from 'obsidian';
```

### 2. Handle Right-Click Events

In your Pixi sprite's event handler:

```typescript
sprite.on('pointerdown', (e: any) => {
  if (e.button === 2) { // Right-click
    e.stopPropagation();
    e.preventDefault();
    
    // Create a new Menu instance
    const menu = new Menu();
    
    // Add menu items...
    
    // Show the menu at mouse position
    menu.showAtMouseEvent(e.originalEvent || e);
  }
});
```

### 3. Add Menu Items

Use the `addItem` method to add items to the menu:

```typescript
menu.addItem((item) => {
  item
    .setTitle('Delete')
    .setIcon('trash')
    .onClick(() => {
      // Your action here
    });
});
```

### 4. Create Submenus

For hierarchical menus, use `setSubmenu()`:

```typescript
menu.addItem((item) => {
  item
    .setTitle('Colored Rings')
    .setIcon('palette')
    .setSubmenu()
    .addItem((subitem) => {
      subitem
        .setTitle('Red')
        .onClick(() => {
          // Set red ring
        });
    });
});
```

### 5. Add Separators

Use `addSeparator()` to group related items:

```typescript
menu.addSeparator();
```

## Key Differences from Custom Menu

1. **Native Look**: Menus automatically match Obsidian's theme
2. **Built-in Icons**: Use Obsidian's icon set with `setIcon()`
3. **Keyboard Navigation**: Native keyboard support out of the box
4. **Performance**: No React re-renders needed

## Example Implementation

See `TokenRenderer.ts` and `PinRenderer.ts` for complete examples of using Obsidian's native menu with Pixi objects.

## Hybrid Approach for Custom UI Elements

For complex UI elements like color pickers that require custom HTML/CSS, you can use a hybrid approach:

```typescript
// Native menu for simple items
menu.addItem((item) => {
  item
    .setTitle('Delete')
    .setIcon('trash')
    .onClick(() => {
      // Simple action
    });
});

// Custom React menu for complex UI
menu.addItem((item) => {
  item
    .setTitle('Colored Rings')
    .setIcon('palette')
    .onClick(() => {
      // Open custom context menu with color swatches
      const menuItems: ContextMenuItem[] = [
        { 
          label: 'Colored Rings', 
          onSelect: () => {}, 
          closeOnSelect: false, 
          submenu: 'ring-colors', 
          data: { tokenId: token.id } 
        },
      ];
      openContextMenuGlobal(menuItems, { x: e.clientX, y: e.clientY });
    });
});
```

This gives you the best of both worlds: native Obsidian styling for simple items and full customization for complex UI elements.

## Important Notes

- Always pass `e.originalEvent || e` to `showAtMouseEvent()` to ensure proper positioning
- The menu automatically handles closing when clicking outside
- Icons are optional but recommended for better UX
- For complex UI like color pickers, use the hybrid approach with custom React menus
- Submenu items are created inline with the parent item's `setSubmenu()` call