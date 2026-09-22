import React, { useState, useEffect } from 'react';
import { Modal, App, TFile } from 'obsidian';
import type { Root } from 'react-dom/client';
import { AssetService, type TokenAsset } from '../../../services/AssetService';
import { TokenStatblockLinkService } from '../../../services/TokenStatblockLinkService';
import { LabelTooltip } from '../primitives/tooltip';
import { resourceUrl } from '../asset-manager/utils/assetFormatters';
import './token-picker.scss';

/** A token asset whose image exists in the vault, with its resolved resource URL. */
interface PickableToken extends TokenAsset {
  imageUrl: string;
}

interface TokenPickerModalProps {
  app: App;
  statblockFile: TFile;
  onTokenSelected: (tokenPath: string) => void;
  onClose: () => void;
}

export class TokenPickerModal extends Modal {
  private root: Root | null = null;
  private statblockFile: TFile;
  private onTokenSelected: (tokenPath: string) => void;

  constructor(
    app: App,
    statblockFile: TFile,
    onTokenSelected: (tokenPath: string) => void
  ) {
    super(app);
    this.statblockFile = statblockFile;
    this.onTokenSelected = onTokenSelected;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // Add our custom class
    this.modalEl.addClass('token-picker-modal-wrapper');
    
    // Set modal title
    this.titleEl.setText(`Select Token for ${this.statblockFile.basename}`);
    
    // Create a container div for React
    const container = contentEl.createDiv({ cls: 'token-picker-root' });
    
    // Create React root using the same pattern as other components
    import('react-dom/client').then(({ createRoot }) => {
      this.root = createRoot(container);
      this.root.render(
        React.createElement(TokenPickerContent, {
          app: this.app,
          statblockFile: this.statblockFile,
          onTokenSelected: this.onTokenSelected,
          onClose: () => this.close()
        })
      );
    }).catch(error => {
      console.error('[TokenPicker] Failed to create React root:', error);
      contentEl.setText('Failed to load token picker');
    });
  }

  onClose(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}

const TokenPickerContent: React.FC<TokenPickerModalProps> = ({
  app,
  statblockFile,
  onTokenSelected,
  onClose
}) => {
  const [tokens, setTokens] = useState<PickableToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    void loadTokens();

    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', () => {
      void loadTokens();
    });

    return () => {
      app.workspace.offref(refreshRef);
    };
  }, []);

  const loadTokens = async (): Promise<void> => {
    try {
      const assetService = AssetService.getInstance(app);
      await assetService.initialize();
      
      // Tokens of all collections; those whose image is missing cannot be picked
      const pickable: PickableToken[] = [];
      for (const asset of await assetService.getTokenAssets()) {
        const imageUrl = resourceUrl(app, asset.imagePath);
        if (imageUrl) pickable.push({ ...asset, imageUrl: resourceUrl(app, asset.thumbnailPath) || imageUrl });
      }
      setTokens(pickable);
      setLoading(false);
    } catch (error) {
      console.error('[TokenPicker] Failed to load tokens:', error);
      setLoading(false);
    }
  };

  const handleTokenClick = async (token: PickableToken): Promise<void> => {
    try {
      const tokenStatblockService = TokenStatblockLinkService.getInstance(app);
      const tokenImagePath = token.imagePath;
      
      // Use the centralized service to link the token to the statblock
      const success = await tokenStatblockService.linkTokenToStatblock(
        tokenImagePath,
        statblockFile.path,
        { 
          showConfirmation: true,
          updateStatblockAvatar: true 
        }
      );
      
      if (success) {
        onTokenSelected(tokenImagePath);
        onClose();
      }
    } catch (error) {
      console.error('[TokenPicker] Failed to assign token:', error);
    }
  };

  const filteredTokens = tokens.filter(token => 
    token.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRemoveToken = async (): Promise<void> => {
    try {
      const tokenStatblockService = TokenStatblockLinkService.getInstance(app);
      const currentTokenImage = tokenStatblockService.readStatblockImage(statblockFile);

      if (currentTokenImage) {
        // Use the centralized service to unlink
        const success = await tokenStatblockService.unlinkToken(
          currentTokenImage,
          { updateStatblockAvatar: true }
        );
        
        if (success) {
          onTokenSelected('');
          onClose();
        }
      }
    } catch (error) {
      console.error('[TokenPicker] Failed to remove token:', error);
    }
  };

  // Get current token assignment
  const currentTokenImage = TokenStatblockLinkService.getInstance(app).readStatblockImage(statblockFile);
  const currentlyAssignedToken = currentTokenImage
    ? tokens.find(t => t.imagePath === currentTokenImage) ?? null
    : null;

  return (
    <div className="token-picker-container">
      <div className="token-picker-search">
        <input
          type="text"
          placeholder="Search tokens..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="token-picker-search-input"
        />
        {currentlyAssignedToken && (
          <LabelTooltip label="Remove current token assignment">
            <button 
              onClick={() => { void handleRemoveToken(); }}
              className="token-picker-remove-btn"
            >
              Unassign Token
            </button>
          </LabelTooltip>
        )}
      </div>
      
      {/* Current assignment indicator */}
      {currentlyAssignedToken && (
        <div className="token-picker-current">
          <div className="token-picker-current-label">Currently assigned:</div>
          <div className="token-picker-current-token">
            <div className="token-picker-current-image">
              <img 
                src={currentlyAssignedToken.imageUrl} 
                alt={currentlyAssignedToken.name}
                onError={(e) => {
                  e.currentTarget.hide();
                }}
              />
            </div>
            <div className="token-picker-current-name">{currentlyAssignedToken.name}</div>
          </div>
        </div>
      )}
      
      <div className="token-picker-content">
        {loading ? (
          <div className="token-picker-loading">Loading tokens...</div>
        ) : filteredTokens.length === 0 ? (
          <div className="token-picker-empty">
            {searchTerm ? 'No tokens found matching your search.' : 'No tokens available.'}
          </div>
        ) : (
          <>
            {!currentlyAssignedToken && (
              <div className="token-picker-section-label">Select a token to assign:</div>
            )}
            {currentlyAssignedToken && (
              <div className="token-picker-section-label">Select a different token to reassign:</div>
            )}
            <div className="token-picker-grid">
              {filteredTokens.map((token) => {
                const isCurrentlyAssigned = currentlyAssignedToken?.id === token.id;
                return (
                  <div
                    key={token.id}
                    className={`token-picker-item ${isCurrentlyAssigned ? 'token-picker-item-current' : ''}`}
                    onClick={() => { if (!isCurrentlyAssigned) void handleTokenClick(token); }}
                    style={{ cursor: isCurrentlyAssigned ? 'default' : 'pointer' }}
                  >
                    <div className="token-picker-image">
                      <img 
                        src={token.imageUrl} 
                        alt={token.name}
                        onError={(e) => {
                          // Hide broken images
                          e.currentTarget.hide();
                        }}
                      />
                    </div>
                    <div className="token-picker-name">{token.name}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
