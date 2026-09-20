import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { createRoot, Root } from 'react-dom/client';
import React, { useState, useEffect } from 'react';
import { AssetService, Asset } from './services/AssetService';
import { GlobalAssetManagerService } from './services/GlobalAssetManagerService';
import { Button } from './packages/components/primitives/button';
import {
  Map,
  Plus,
  FolderOpen,
  Clock,
  Loader2,
  FileText,
  Play,
  Sparkles,
} from 'lucide-react';
import { runInBackground } from './utils/backgroundTask';

export const DASHBOARD_VIEW_TYPE = "atlas-vtt-dashboard";

interface RecentScene {
  id: string;
  path: string;
  name: string;
  collectionName: string;
  collectionId: string;
  modifiedAt: number;
  thumbnailUrl: string | null;
}

interface DashboardProps {
  app: any;
  onOpenScene: (filePath: string) => void;
  onCreateMap: () => void;
  onOpenAssetManager: () => void;
}

/** Get the .atlasmap file path from a scene or map asset. */
function getAssetMapPath(asset: Asset): string {
  if (asset.type === 'scene') {
    return asset.data?.mapPath ?? '';
  }
  if (asset.type === 'map') {
    return asset.mapFilePath ?? '';
  }
  return '';
}

/** Resolve an asset's thumbnail to a vault resource URL. */
function resolveAssetThumbnail(app: any, asset: Asset): string | null {
  const mapPath = getAssetMapPath(asset);
  if (!mapPath) return null;

  const thumbPath = mapPath.replace('.atlasmap', '.thumb.jpg');
  const thumbFile = app.vault.getAbstractFileByPath(thumbPath);
  if (thumbFile instanceof TFile) {
    return app.vault.getResourcePath(thumbFile);
  }
  return null;
}

const Dashboard: React.FC<DashboardProps> = ({
  app,
  onOpenScene,
  onCreateMap,
  onOpenAssetManager,
}) => {
  const [recentScenes, setRecentScenes] = useState<RecentScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadRecentScenes();
  }, []);

  const loadRecentScenes = async (): Promise<void> => {
    try {
      const assetService = AssetService.getInstance(app);
      const collections = await assetService.getCollections();

      // Load both 'scene' and 'map' asset types from every collection
      const scenePromises = collections.flatMap((col) =>
        (['scene', 'map'] as const).map(async (type) => {
          const assets = await assetService.getAssets(col.id, type);
          return assets.map((asset) => ({
            id: asset.id,
            path: getAssetMapPath(asset),
            name: asset.name,
            collectionName: col.name,
            collectionId: col.id,
            modifiedAt: asset.modifiedAt,
            thumbnailUrl: resolveAssetThumbnail(app, asset),
          } satisfies RecentScene));
        })
      );

      const allScenes = (await Promise.all(scenePromises))
        .flat()
        .filter((scene) => scene.path !== '')
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, 8);

      setRecentScenes(allScenes);
    } catch (error) {
      console.error('[Dashboard] Error loading recent scenes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const heroScene = recentScenes[0] ?? null;

  const actionTiles = [
    { key: 'create', icon: Plus, title: 'Create Scene', desc: 'Browse maps & build a scene', onClick: onCreateMap },
    { key: 'assets', icon: FolderOpen, title: 'Asset Manager', desc: 'Your scenes & assets', onClick: onOpenAssetManager },
  ] as const;

  return (
    <div className="atlas-dashboard">
      <div className="dashboard-container">
        {/* Hero + actions stage */}
        <main className="dashboard-stage">
          <div className="dashboard-hero">
            <h1 className="dashboard-title">
              Atlas<span>VTT</span>
            </h1>
            <p className="dashboard-tagline">Gather your party and venture forth.</p>
          </div>

          <div className="dashboard-columns">
            <div className="dashboard-actions">
              {heroScene ? (
                <Button
                  variant="ghost"
                  className="hero-card"
                  onClick={() => onOpenScene(heroScene.path)}
                >
                  <div className="dashboard-thumb dashboard-thumb--l">
                    {heroScene.thumbnailUrl ? (
                      <img src={heroScene.thumbnailUrl} alt="" />
                    ) : (
                      <Map size={24} />
                    )}
                  </div>
                  <div className="hero-card-body">
                    <span className="hero-card-eyebrow">
                      <Clock size={13} /> Continue your adventure
                    </span>
                    <span className="hero-card-title">{heroScene.name}</span>
                    <span className="hero-card-meta">
                      {heroScene.collectionName} &middot; {formatRelativeTime(heroScene.modifiedAt)}
                    </span>
                  </div>
                  <span className="hero-card-go">
                    <Play size={18} />
                  </span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="hero-card hero-card--empty"
                  onClick={onCreateMap}
                >
                  <div className="hero-card-body">
                    <span className="hero-card-eyebrow">
                      <Sparkles size={13} /> Begin
                    </span>
                    <span className="hero-card-title">Create your first scene</span>
                    <span className="hero-card-meta">Choose a map and start your campaign</span>
                  </div>
                  <span className="hero-card-go">
                    <Plus size={18} />
                  </span>
                </Button>
              )}

              <div className="action-grid">
                {actionTiles.map(({ key, icon: Icon, title, desc, onClick }) => (
                  <Button key={key} variant="ghost" className="action-card" onClick={onClick}>
                    <span className="action-icon">
                      <Icon size={18} />
                    </span>
                    <span className="action-text">
                      <span className="action-title">{title}</span>
                      <span className="action-desc">{desc}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <aside className="dashboard-recent">
              <div className="dashboard-panel">
                <div className="panel-heading">Recent Scenes</div>
                {isLoading ? (
                  <div className="recent-loading">
                    <Loader2 size={20} className="spinner" />
                    <span>Loading scenes&hellip;</span>
                  </div>
                ) : recentScenes.length > 0 ? (
                  <div className="recent-scenes">
                    {recentScenes.map((scene) => (
                      <Button
                        key={scene.id}
                        variant="ghost"
                        className="recent-scene-item"
                        onClick={() => onOpenScene(scene.path)}
                      >
                        <div className="dashboard-thumb">
                          {scene.thumbnailUrl ? (
                            <img src={scene.thumbnailUrl} alt={scene.name} />
                          ) : (
                            <Map size={18} />
                          )}
                        </div>
                        <div className="recent-scene-content">
                          <div className="recent-scene-name">{scene.name}</div>
                          <div className="recent-scene-meta">
                            <span className="recent-scene-collection">{scene.collectionName}</span>
                            <span className="recent-scene-separator">&middot;</span>
                            <span>{formatRelativeTime(scene.modifiedAt)}</span>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="recent-empty">
                    <FileText size={28} className="empty-icon" />
                    <p>No scenes yet. Create one to begin your journey.</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

/**
 * Dashboard View - Welcome screen and main entry point for Atlas VTT
 */
export class DashboardView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: any) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Atlas dashboard";
  }

  getIcon(): string {
    return "home";
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-dashboard-view');

    try {
      this.root = createRoot(containerEl);

      this.root.render(
        <Dashboard
          app={this.app}
          onOpenScene={(filePath) => { void this.handleOpenScene(filePath); }}
          onCreateMap={() => runInBackground(this.handleCreateMap(), 'Opening the map picker', 'Could not open the asset manager')}
          onOpenAssetManager={() => this.handleOpenAssetManager()}
        />
      );
    } catch (error) {
      console.error('[DashboardView] Error during React rendering:', error);
      containerEl.createDiv({ text: 'Dashboard loading failed. Please check console for errors.' });
    }
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private async handleOpenScene(filePath: string): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        new Notice(`Scene file not found: ${filePath}`);
        return;
      }

      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: 'atlas-vtt',
        state: { file: filePath }
      });
      this.app.workspace.setActiveLeaf(leaf);
    } catch (error) {
      console.error('Error opening scene:', error);
      new Notice('Error opening scene');
    }
  }

  private async handleCreateMap(): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    const maps = await assetService.getAssets(undefined, 'map');

    if (maps.length === 0) {
      new Notice('Add a map image first, then create a scene from it.');
    }

    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('maps');
  }

  private handleOpenAssetManager(): void {
    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('scenes');
  }
}
