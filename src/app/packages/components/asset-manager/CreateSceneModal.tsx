import React, { useState, useRef, useEffect } from 'react';
import { Notice, normalizePath } from 'obsidian';
import { motion } from 'framer-motion';
import { MapIcon } from 'lucide-react';
import { AssetService } from '../../../services/AssetService';
import { tokenBarsOf, withTokenBars } from '../../../services/collectionTokenBars';
import { normalizeImagePath } from '../../../utils/pathUtils';
import { ensureFolder } from '../../../plugin/vaultFolders';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { TagPicker } from './token-creator/TagPicker';
import { useAssetTags } from './token-creator/useAssetTags';

interface CreateSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCollection: string | null;
  assetService: AssetService | null;
  onSceneCreated: () => void;
  // Optional prefill when invoked from double-clicking a map
  backgroundPath?: string | null;
  defaultName?: string;
}

export default function CreateSceneModal({
  isOpen,
  onClose,
  selectedCollection,
  assetService,
  onSceneCreated,
  backgroundPath,
  defaultName
}: CreateSceneModalProps) {
  const [sceneName, setSceneName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { tags, createTag, isCreatingTag } = useAssetTags(assetService, isOpen, selectedCollection || 'default', 'maps');
  const inputRef = useRef<HTMLInputElement>(null);
  const { app } = useAtlasUI();
  const [hasSetDefaultName, setHasSetDefaultName] = useState(false);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Prefill from defaults if provided (only once per modal open)
      if (defaultName && !hasSetDefaultName) {
        setSceneName(defaultName);
        setHasSetDefaultName(true);
        // Select all text only when first setting the default name
        window.setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      }
      inputRef.current.focus();
    }
  }, [isOpen, defaultName, hasSetDefaultName]);
  
  // Reset the flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasSetDefaultName(false);
      setSceneName(''); // Clear the name when closing
      setSelectedTags([]);
    }
  }, [isOpen]);

  // Handle Escape key globally
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  const handleCreate = async () => {
    if (!sceneName.trim() || !assetService || isCreating || isCreatingTag) return;

    setIsCreating(true);
    try {
      const selection = selectedCollection || 'default';
      const collection = await assetService.getCollection(selection);
      if (!collection) {
        throw new Error(`Collection "${selection}" no longer exists. Select another collection and try again.`);
      }
      const collectionId = collection.id;

      // Create a new empty scene structure
      const normalizedBackground = backgroundPath ? normalizeImagePath(backgroundPath) : null;
      const mapData = {
        state: {
          schema: "atlas-vtt",
          version: 3,
          // If invoked from a map, prefill background (ensure vault-relative path)
          background: normalizedBackground,
          grid: {
            enabled: true,
            visible: true,
            snapToGrid: true,
            type: 'square',
            size: 70,
            offsetX: 0,
            offsetY: 0,
            opacity: 0.5,
            lineType: 'solid' as const,
            lineWidth: 1,
            autoDetect: true
          },
          objects: {
            tokens: {},
            fog: {},
            pins: {},
            texts: {},
            drawings: {} // Include drawings for all scenes
          },
          camera: {
            x: 0,
            y: 0,
            scale: 1
          }
        },
        version: 3
      };

      // Apply collection grid defaults if available
      if (assetService) {
        const settings = assetService.getCollectionSettings(collectionId);
        if (settings.gridDefaults) {
          const gd = settings.gridDefaults;
          Object.assign(mapData.state.grid, {
            unitType: gd.unitType,
            unitDistance: gd.unitDistance,
            measurementType: gd.measurementMode === 'abstract' ? 'abstract' as const : 'units' as const,
          });
        }
        // The collection's resource bars, e.g. Daggerheart's Stress
        Object.assign(mapData.state, { tokenSettings: withTokenBars(undefined, tokenBarsOf(settings.defaultWidgets)) });
      }

      const scenePath = normalizePath(`atlas-vtt/collections/${collectionId}/scenes/${sceneName.trim()}.atlasmap`);

      if (app.vault.getAbstractFileByPath(scenePath)) {
        new Notice(`A scene named "${sceneName.trim()}" already exists`);
        return;
      }

      await ensureFolder(app, scenePath.substring(0, scenePath.lastIndexOf('/')));
      const sceneFile = await app.vault.create(scenePath, JSON.stringify(mapData, null, 2));

      // Register the scene with AssetService
      if (assetService) {
        const sceneAsset = {
          type: 'scene' as const,
          name: sceneName.trim(),
          collection: collectionId,
          tags: selectedTags,
          data: {
            mapPath: scenePath
          }
        };
        
        await assetService.addAsset(sceneAsset);
      }
      
      await app.workspace.getLeaf(false).openFile(sceneFile);
      
      // Close the modal
      onClose();
      
      // Notify that scene was created (this will close the asset manager)
      onSceneCreated();
    } catch (error) {
      console.error('[CreateSceneModal] Error creating scene:', error);
      new Notice(`Could not create scene: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const windowVariants = useDialogWindowVariants();

  if (!isOpen) return null;

  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-root atlas-create-scene-modal"
      onClick={(e) => {
        // Prevent propagation to asset manager
        e.stopPropagation();
        // Only close if clicking on the backdrop itself (not its children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseDown={(e) => {
        // Also stop propagation on mousedown
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // Stop propagation of keyboard events
        e.stopPropagation();
      }}
      tabIndex={-1}
      style={{ outline: 'none' }}
    >
      <motion.div
        className="atlas-create-scene-container"
        variants={windowVariants}
        onClick={(e) => {
          // Prevent any clicks inside the container from bubbling up
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          // Also stop propagation on mousedown
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          // Stop propagation of keyboard events
          e.stopPropagation();
        }}
      >
        <div className="atlas-create-scene-header">
          <h3>
            <MapIcon />
            New scene
          </h3>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-create-scene-body">
          <div className="atlas-create-scene-field">
            <label className="atlas-create-scene-label">Scene Name</label>
            <input
              ref={inputRef}
              type="text"
              className="atlas-create-scene-input"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter scene name"
            />
          </div>

          <TagPicker
            available={tags}
            selected={selectedTags}
            onToggle={(tag) => setSelectedTags((previous) => previous.includes(tag) ? previous.filter((name) => name !== tag) : [...previous, tag])}
            onCreate={createTag}
            disabled={!assetService || isCreating}
          />
        </div>

        <div className="atlas-create-scene-footer">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" onClick={() => { void handleCreate(); }} disabled={!sceneName.trim() || !assetService || isCreating || isCreatingTag}>
            {isCreating ? 'Creating…' : 'Create scene'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
