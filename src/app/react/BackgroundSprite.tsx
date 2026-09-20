import React, { useEffect, useState, useRef } from 'react';
import { Assets, Texture, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useAtlasUI } from './root/AtlasUIContext';
import { useViewStoreHook } from './ViewStoreContext';
import { toError } from '../utils/errors';

interface BackgroundSpriteProps {
  imagePath: string;
}

export const BackgroundSprite: React.FC<BackgroundSpriteProps> = ({ imagePath }) => {
  const { app, renderer } = useAtlasUI();
  const store = useViewStoreHook();
  const [texture, setTexture] = useState<Texture | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const backgroundSpriteRef = useRef<Sprite | null>(null);
  const textureUrlRef = useRef<string | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Create abort controller for this load operation
    const abortController = new AbortController();
    loadAbortControllerRef.current = abortController;
    
    // Load the image texture
    const loadTexture = async () => {
      if (!imagePath) return;
      
      // Mark as loading
      isLoadingRef.current = true;
      
      try {
        let url: string;
        
        // Check if this is a blob URL (for streamed maps) or a file path
        if (imagePath.startsWith('blob:')) {
          url = imagePath;
        } else {
          // Get the resource path from Obsidian for regular file paths
          const imgFile = app.vault.getAbstractFileByPath(imagePath);
          if (!imgFile) {
            console.error(`[BackgroundSprite] Image file not found: ${imagePath}`);
            isLoadingRef.current = false;
            return;
          }
          url = app.vault.adapter.getResourcePath(imgFile.path);
        }
        
        // Check if aborted
        if (abortController.signal.aborted) {
          isLoadingRef.current = false;
          return;
        }
        
        textureUrlRef.current = url; // Track the URL for unloading
        
        let loadedTexture: Texture;
        if (url.startsWith('blob:')) {
          // For blob URLs, create an Image element first, then create texture from it
          const img = new Image();
          
          // Wait for the image to load
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (err) => reject(toError(err, 'Failed to load blob image'));
            img.src = url;
          });
          
          // Create texture from the loaded image
          loadedTexture = Texture.from(img);
        } else {
          // For regular file URLs, use Assets.load()
          loadedTexture = await Assets.load(url);
        }
        
        // Apply best practices for VTT maps
        if (loadedTexture.source) {
          // Enable bilinear filtering for smooth scaling
          loadedTexture.source.scaleMode = 'linear';

          // Only enable mipmapping for smaller textures to avoid massive memory consumption
          // Mipmaps add ~33% memory overhead, which for a 4096x4096 RGBA texture is ~22MB
          const MIPMAP_SIZE_THRESHOLD = 2048;
          if (loadedTexture.width <= MIPMAP_SIZE_THRESHOLD && loadedTexture.height <= MIPMAP_SIZE_THRESHOLD) {
            loadedTexture.source.autoGenerateMipmaps = true;
            loadedTexture.source.update();
          } else {
            // For large textures, skip mipmaps to save memory
            loadedTexture.source.autoGenerateMipmaps = false;
          }

          // Check texture size and warn if too large
          const MAX_TEXTURE_SIZE = 8192;
          if (loadedTexture.width > MAX_TEXTURE_SIZE || loadedTexture.height > MAX_TEXTURE_SIZE) {
            console.warn(`[BackgroundSprite] Texture size (${loadedTexture.width}x${loadedTexture.height}) exceeds recommended maximum of ${MAX_TEXTURE_SIZE}x${MAX_TEXTURE_SIZE}. Consider resizing for better performance.`);
          }
        }
        
        // Check if aborted before setting state
        if (!abortController.signal.aborted) {
          setTexture(loadedTexture);
          setSize({
            width: loadedTexture.width,
            height: loadedTexture.height
          });
        }
        
        // Mark as loaded
        isLoadingRef.current = false;
        
      } catch (error) {
        console.error(`[BackgroundSprite] Failed to load texture: ${imagePath}`, error);
        isLoadingRef.current = false;
      }
    };

    void loadTexture();
    
    // Cleanup function to unload texture when component unmounts or imagePath changes
    return () => {
      // Abort any ongoing load operation
      if (loadAbortControllerRef.current) {
        loadAbortControllerRef.current.abort();
      }
      
      // Only clean up if not currently loading
      if (!isLoadingRef.current && textureUrlRef.current) {
        // For blob URLs, we need to be careful not to revoke while still in use
        if (textureUrlRef.current.startsWith('blob:')) {
          // Delay blob URL revocation to ensure any pending operations complete
          const urlToRevoke = textureUrlRef.current;
          window.setTimeout(() => {
            URL.revokeObjectURL(urlToRevoke);
          }, 100);
        } else {
          // Only unload regular file URLs that were loaded with Assets.load
          Assets.unload(textureUrlRef.current).catch(err => {
            console.warn('[BackgroundSprite] Failed to unload texture:', err);
          });
        }
        textureUrlRef.current = null;
      }
    };
  }, [imagePath, app.vault]);

  // Add/update the sprite in the viewport when texture is loaded
  useEffect(() => {
    if (!texture || !renderer) return;
    
    const viewport = renderer.getViewportInstance() as Viewport | null;
    if (!viewport) {
      console.error('[BackgroundSprite] No viewport available');
      return;
    }
    
    // --- Remove the previous background sprite if it exists ---
    if (backgroundSpriteRef.current) {
      const oldSprite = backgroundSpriteRef.current;
      oldSprite.visible = false;
      oldSprite.renderable = false;
      
      if (oldSprite.parent) {
        oldSprite.parent.removeChild(oldSprite);
      }
      
      // Destroy after render cycle
      window.requestAnimationFrame(() => {
        if (oldSprite && !oldSprite.destroyed) {
          oldSprite.destroy({ 
            children: true,
            texture: false
          });
        }
      });
      
      backgroundSpriteRef.current = null;
    }
    // --- End removal of previous sprite ---
    
    // Create sprite using native PixiJS
    const sprite = new Sprite(texture);
    sprite.width = size.width;
    sprite.height = size.height;
    sprite.x = 0;
    sprite.y = 0;
    sprite.zIndex = 0; // Explicitly set background zIndex to 0 (or a low value)
    
    // Add to viewport
    viewport.addChild(sprite);
    backgroundSpriteRef.current = sprite; // Store reference to the new sprite
    
    // Let the renderer know about the background sprite and its URL
    if (renderer.setBackgroundSprite) {
      renderer.setBackgroundSprite(sprite);
    }
    
    // Initialize grid system if it doesn't exist (crucial for streamed maps)
    const gridSystem = renderer.getGridSystem();
    if (!gridSystem) {
      // Get current grid settings from the store (for streamed maps)
      const currentState = store.getState();
      const gridOptions = currentState.grid || {
        enabled: true,
        visible: true,
        type: 'square',
        size: 70,
        offsetX: 0,
        offsetY: 0,
        color: 0xFFFFFF,
        opacity: 0.3,
        lineType: 'dotted',
        lineWidth: 1
      };
      renderer.initGrid(gridOptions, sprite);
    }
    
    // Explicitly sort children after adding the background
    viewport.sortChildren(); 
    
    // Center the map in the viewport
    viewport.moveCenter(size.width / 2, size.height / 2);
    
    // Set world size to match the map dimensions
    viewport.worldWidth = Math.max(size.width, 10000);
    viewport.worldHeight = Math.max(size.height, 10000);

    // The grid system will now handle sprite readiness checking internally
    // No need to force recreation here as the grid system will wait for the sprite to be ready
    
    // Cleanup function: Remove only this background sprite
    return () => {
      if (backgroundSpriteRef.current) {
        const spriteToClean = backgroundSpriteRef.current;
        spriteToClean.visible = false;
        spriteToClean.renderable = false;
        
        if (spriteToClean.parent) {
          try {
            spriteToClean.parent.removeChild(spriteToClean);
          } catch {
            // Parent might be destroyed
          }
        }
        
        // Destroy after render cycle
        window.requestAnimationFrame(() => {
          if (spriteToClean && !spriteToClean.destroyed) {
            try {
              spriteToClean.destroy({ 
                children: true,
                texture: false
              });
            } catch {
              // Ignore destruction errors
            }
          }
        });
        
        backgroundSpriteRef.current = null;
      }
    };
  }, [texture, size, renderer]);
  
  // We're not returning any JSX as we're directly manipulating the Pixi viewport
  return null;
}; 