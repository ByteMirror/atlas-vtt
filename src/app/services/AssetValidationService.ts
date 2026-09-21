import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { MapFile } from './MapPersistence';

/** The parts of a map that reference vault images; satisfied by a MapFile and by the live store state. */
export interface MapAssetReferences {
    background: MapFile['background'];
    objects: Pick<MapFile['objects'], 'tokens'>;
}

export interface MissingAsset {
    id: string;
    type: 'token' | 'map';
    path: string;
    objectId: string;
    objectName?: string;
}

export interface AssetValidationResult {
    valid: boolean;
    missingAssets: MissingAsset[];
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
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
            const exists = file instanceof TFile;
            this.validationCache.set(path, exists);
            return exists;
        } catch {
            this.validationCache.set(path, false);
            return false;
        }
    }

    async validateMapAssets(mapData: MapAssetReferences): Promise<AssetValidationResult> {
        const result: AssetValidationResult = {
            valid: true,
            missingAssets: []
        };

        if (mapData.background && !(await this.validateAsset(mapData.background))) {
            result.valid = false;
            result.missingAssets.push({
                id: 'background',
                type: 'map',
                path: mapData.background,
                objectId: 'background',
                objectName: 'Map Background'
            });
        }

        for (const [tokenId, token] of Object.entries(mapData.objects.tokens)) {
            if (token.imagePath && !(await this.validateAsset(token.imagePath))) {
                result.valid = false;
                result.missingAssets.push({
                    id: tokenId,
                    type: 'token',
                    path: token.imagePath,
                    objectId: tokenId,
                    objectName: (token.kind === 'character' && token.name) || tokenId
                });
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

        let message = 'Missing assets detected:\n';
        if (tokenCount > 0) message += `- ${tokenCount} token image${tokenCount > 1 ? 's' : ''}\n`;
        if (mapCount > 0) message += `- ${mapCount} map background${mapCount > 1 ? 's' : ''}\n`;
        
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
}
