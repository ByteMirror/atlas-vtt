# Encounter Spawning System Documentation

## Overview

The Encounter Spawning System in Atlas VTT allows users to spawn multiple tokens at once from pre-configured encounter or player group assets. This system enables quick setup of combat scenarios by placing all necessary tokens on the map with a single action.

## Architecture

### Core Components

1. **AssetManager** (`/src/app/packages/components/asset-manager/AssetManager.tsx`)
   - Handles the UI for managing encounters and player groups
   - Implements the double-click spawning logic
   - Manages viewport calculations and token placement

2. **AssetService** (`/src/app/services/AssetService.ts`)
   - Stores encounter and player group definitions
   - Provides the tokens array data for each encounter/player group
   - Handles persistence of encounter metadata

3. **TokenRenderer** (`/src/app/pixi/TokenRenderer.ts`)
   - Renders the spawned tokens on the map
   - Handles texture loading and caching
   - Manages token visibility and positioning

4. **Store** (`/src/app/storeFactory.ts`)
   - Manages token state through the `addToken` function
   - Normalizes image paths to prevent app:// URLs
   - Handles token ID generation

## Data Structure

### EncounterAsset
```typescript
interface EncounterAsset extends BaseAsset {
  type: 'encounter';
  tokens: {
    id: string;
    name: string;
    imagePath: string;
    x?: number;
    y?: number;
    statblockPath?: string;
    size?: number;
  }[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'deadly';
  thumbnailUrl?: string;
  data: any;
}
```

### PlayerAsset
```typescript
interface PlayerAsset extends BaseAsset {
  type: 'player';
  tokens: {
    id: string;
    name: string;
    imagePath: string;
    x?: number;
    y?: number;
    statblockPath?: string;
    size?: number;
  }[];
  level?: number;
  class?: string;
  thumbnailUrl?: string;
  data: any;
}
```

## Spawning Process

### 1. User Interaction
- User double-clicks on an encounter or player group in the Asset Manager
- The `handleDoubleClick` function in AssetCard component is triggered

### 2. Viewport Calculation
```typescript
// Get the actual center of the viewport in world coordinates
const viewportBounds = viewport.getVisibleBounds();
centerX = (viewportBounds.left + viewportBounds.right) / 2;
centerY = (viewportBounds.top + viewportBounds.bottom) / 2;
```

### 3. Token Placement Algorithm
- Tokens are arranged in a grid pattern around the viewport center
- Grid size is calculated based on the number of tokens: `Math.ceil(Math.sqrt(tokensToSpawn.length))`
- Each token position is offset from center based on its grid position
- Positions are snapped to the map's grid if snap-to-grid is enabled

### 4. Token Validation
Before spawning each token:
```typescript
// Validate the image path exists
const imageFile = app.vault.getAbstractFileByPath(token.imagePath);
if (!imageFile) {
  console.error(`[AssetCard] Encounter token image not found: ${token.imagePath}`);
  new Notice(`Token image not found: ${token.imagePath}`);
  continue; // Skip this token
}
```

### 5. Token Data Enhancement
For tokens with linked statblocks:
- Load HP values (current and max)
- Load stress values
- Load difficulty ratings (CR or tier)
- Use statblock name if available

### 6. Token Creation
```typescript
const tokenData: any = {
  x: spawnX,
  y: spawnY,
  imagePath: token.imagePath,
  kind: 'character' as const,
  name: token.name || `Token ${index + 1}`,
  hp: 100 // Default, overridden by statblock data if available
};

const tokenId = addToken(tokenData);
```

### 7. Post-Spawn Actions
- Select all spawned tokens
- Center viewport on the spawned tokens with animation
- Show notice with spawn count

## Asset Loading

When the Asset Manager loads encounters/players:

```typescript
...(asset.type === 'encounter' && {
  tokens: (asset as ServiceEncounterAsset).tokens || 
          (asset as ServiceAsset & { data?: { tokens?: any[] } }).data?.tokens || [],
  description: (asset as ServiceEncounterAsset).description,
  difficulty: (asset as ServiceEncounterAsset).difficulty
})
```

This ensures the tokens array is properly loaded from either:
1. Direct property on the asset (`asset.tokens`)
2. Nested in the data property (`asset.data.tokens`)

## Error Handling

### Missing Images
- Tokens with missing images are skipped
- User is notified via toast message
- Spawn continues with remaining valid tokens

### Invalid Viewport
- Falls back to viewport position (0,0) if bounds calculation fails
- Ensures spawning continues even with viewport errors

### Spawn Count Validation
```typescript
const actualSpawned = spawnedTokenIds.length;
const expectedSpawned = tokensToSpawn.length;
if (actualSpawned < expectedSpawned) {
  new Notice(`Spawned ${actualSpawned} of ${expectedSpawned} tokens from encounter "${encounterAsset.name}" (some tokens had missing images)`);
}
```

## Debug Logging

The system includes comprehensive logging for troubleshooting:

1. **Encounter Loading**
   - `[AssetManager] Formatting encounter asset` - Shows encounter data structure
   - `[AssetCard] Spawning encounter:` - Shows full encounter asset
   - `[AssetCard] Tokens to spawn:` - Shows tokens array

2. **Position Calculation**
   - `[AssetCard] Viewport bounds:` - Shows viewport boundaries
   - `[AssetCard] Token X spawn position:` - Shows position math for each token

3. **Token Creation**
   - `[AssetCard] Processing encounter token:` - Shows raw token data
   - `[AssetCard] Spawning encounter token with data:` - Shows formatted token data
   - `[ViewStore] addToken called with data:` - Shows final token data in store

4. **Rendering**
   - `[TokenRenderer] Processing token` - Shows token being rendered
   - `[TokenRenderer] Added token X to container` - Confirms token added to display

## Common Issues and Solutions

### Issue: "0 tokens spawned from encounter"
**Cause**: Encounter tokens array not properly loaded
**Solution**: Ensure encounter asset includes tokens array in either `asset.tokens` or `asset.data.tokens`

### Issue: Tokens spawn but don't appear
**Cause**: Tokens placed outside viewport or invalid image paths
**Solution**: 
- Check console for "token image not found" errors
- Verify viewport centering animation occurs
- Check token positions in debug logs

### Issue: Tokens don't persist after reload
**Cause**: Tokens not properly added to store
**Solution**: Ensure `addToken()` is called directly, not through events

## Testing Checklist

1. **Basic Spawning**
   - [ ] Double-click encounter spawns all tokens
   - [ ] Tokens appear at viewport center
   - [ ] Tokens are properly spaced in grid pattern

2. **Error Handling**
   - [ ] Encounters with missing token images show appropriate notice
   - [ ] Partial spawning works (some tokens spawn even if others fail)
   - [ ] Empty encounters show "0 tokens spawned" message

3. **Token Properties**
   - [ ] Spawned tokens have correct names
   - [ ] Statblock data (HP, stress, difficulty) loads correctly
   - [ ] Token positions snap to grid when enabled

4. **UI Feedback**
   - [ ] All spawned tokens are selected
   - [ ] Viewport animates to center on tokens
   - [ ] Success notice shows correct count

## Future Improvements

1. **Formation Templates**
   - Allow different spawn patterns (line, circle, custom formations)
   - Save formation preferences per encounter

2. **Spawn Preview**
   - Show ghost tokens before confirming spawn
   - Allow manual adjustment before placing

3. **Batch Operations**
   - Support spawning multiple encounters at once
   - Maintain spatial relationships from encounter setup

4. **Performance Optimization**
   - Batch token creation for large encounters
   - Optimize texture loading for duplicate tokens