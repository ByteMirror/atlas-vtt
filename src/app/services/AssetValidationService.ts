import { App, Notice, TFile } from 'obsidian';

export interface MissingAsset {
    id: string;
    type: 'token' | 'map' | 'pin';
    path: string;
    objectId: string;
    objectName?: string;
}

export interface AssetValidationResult {
    valid: boolean;
    missingAssets: MissingAsset[];
    warnings: string[];
}

export class AssetValidationService {
    private missingAssetPlaceholder: string | null = null;
    private validationCache = new Map<string, boolean>();
    
    constructor(private plugin: { app: App }) {
        void this.initializePlaceholderAsset();
    }

    private async initializePlaceholderAsset(): Promise<void> {
        // Create a simple placeholder image data URL
        const canvas = createEl('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            // Draw a gray background
            ctx.fillStyle = '#404040';
            ctx.fillRect(0, 0, 128, 128);
            
            // Draw a question mark
            ctx.fillStyle = '#808080';
            ctx.font = 'bold 64px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 64, 64);
            
            // Draw border
            ctx.strokeStyle = '#606060';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 124, 124);
            
            this.missingAssetPlaceholder = canvas.toDataURL();
        }
    }

    async validateAsset(path: string): Promise<boolean> {
        // Check cache first
        if (this.validationCache.has(path)) {
            return this.validationCache.get(path)!;
        }

        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            const exists = file instanceof TFile;
            this.validationCache.set(path, exists);
            return exists;
        } catch {
            this.validationCache.set(path, false);
            return false;
        }
    }

    async validateMapAssets(mapData: any): Promise<AssetValidationResult> {
        const result: AssetValidationResult = {
            valid: true,
            missingAssets: [],
            warnings: []
        };

        // Validate background image
        if (mapData.background?.imagePath) {
            const isValid = await this.validateAsset(mapData.background.imagePath);
            if (!isValid) {
                result.valid = false;
                result.missingAssets.push({
                    id: 'background',
                    type: 'map',
                    path: mapData.background.imagePath,
                    objectId: 'background',
                    objectName: 'Map Background'
                });
            }
        }

        // Validate tokens
        if (mapData.tokens) {
            for (const [tokenId, token] of Object.entries(mapData.tokens)) {
                if ((token as any).imagePath) {
                    const isValid = await this.validateAsset((token as any).imagePath);
                    if (!isValid) {
                        result.valid = false;
                        result.missingAssets.push({
                            id: tokenId,
                            type: 'token',
                            path: (token as any).imagePath,
                            objectId: tokenId,
                            objectName: (token as any).name || tokenId
                        });
                    }
                }
            }
        }

        // Validate pins
        if (mapData.pins) {
            for (const [pinId, pin] of Object.entries(mapData.pins)) {
                if ((pin as any).iconPath) {
                    const isValid = await this.validateAsset((pin as any).iconPath);
                    if (!isValid) {
                        result.warnings.push(`Pin ${pinId} has missing icon: ${(pin as any).iconPath}`);
                    }
                }
            }
        }

        return result;
    }

    getMissingAssetPlaceholder(): string | null {
        return this.missingAssetPlaceholder;
    }

    showMissingAssetsNotice(missingAssets: MissingAsset[]): void {
        if (missingAssets.length === 0) return;

        const tokenCount = missingAssets.filter(a => a.type === 'token').length;
        const mapCount = missingAssets.filter(a => a.type === 'map').length;
        const pinCount = missingAssets.filter(a => a.type === 'pin').length;

        let message = 'Missing assets detected:\n';
        if (tokenCount > 0) message += `- ${tokenCount} token image${tokenCount > 1 ? 's' : ''}\n`;
        if (mapCount > 0) message += `- ${mapCount} map background${mapCount > 1 ? 's' : ''}\n`;
        if (pinCount > 0) message += `- ${pinCount} pin icon${pinCount > 1 ? 's' : ''}\n`;
        
        message += '\nMissing assets will display as placeholders.';

        new Notice(message, 5000);
    }

    clearCache(): void {
        this.validationCache.clear();
    }

    // Asset recovery methods
    async findSimilarAssets(missingPath: string): Promise<string[]> {
        const fileName = missingPath.split('/').pop() || '';
        const similarFiles: string[] = [];

        // Search for files with similar names
        const allFiles = this.plugin.app.vault.getFiles();
        for (const file of allFiles) {
            if (file.extension.match(/^(png|jpg|jpeg|webp|gif)$/i)) {
                if (file.name.toLowerCase().includes(fileName.toLowerCase())) {
                    similarFiles.push(file.path);
                }
            }
        }

        return similarFiles;
    }

    async relocateAsset(oldPath: string, newPath: string, mapData: any): Promise<boolean> {
        let updated = false;

        // Update background
        if (mapData.background?.imagePath === oldPath) {
            mapData.background.imagePath = newPath;
            updated = true;
        }

        // Update tokens
        if (mapData.tokens) {
            for (const token of Object.values(mapData.tokens)) {
                if ((token as any).imagePath === oldPath) {
                    (token as any).imagePath = newPath;
                    updated = true;
                }
            }
        }

        // Update pins
        if (mapData.pins) {
            for (const pin of Object.values(mapData.pins)) {
                if ((pin as any).iconPath === oldPath) {
                    (pin as any).iconPath = newPath;
                    updated = true;
                }
            }
        }

        return updated;
    }

    async cleanupOrphanedReferences(mapData: any): Promise<number> {
        let removedCount = 0;
        const validation = await this.validateMapAssets(mapData);

        // Remove tokens with missing assets
        if (mapData.tokens && validation.missingAssets.length > 0) {
            const tokensToRemove = validation.missingAssets
                .filter(a => a.type === 'token')
                .map(a => a.objectId);

            for (const tokenId of tokensToRemove) {
                delete mapData.tokens[tokenId];
                removedCount++;
            }
        }

        return removedCount;
    }
}