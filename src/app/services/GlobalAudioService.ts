import { AudioService } from './AudioService';

/**
 * Global singleton audio service that persists across all maps and views
 * Ensures music continues playing when switching between maps, tabs, or closing the DM dashboard
 */
export class GlobalAudioService {
    private static instance: GlobalAudioService | null = null;
    private audioService: AudioService;

    private constructor() {
        this.audioService = new AudioService();
    }

    static getInstance(): GlobalAudioService {
        if (!GlobalAudioService.instance) {
            GlobalAudioService.instance = new GlobalAudioService();
        }
        return GlobalAudioService.instance;
    }

    /**
     * Get the global audio service instance
     */
    getAudioService(): AudioService {
        return this.audioService;
    }

    /**
     * Clean up the global audio service
     */
    destroy(): void {
        this.audioService.destroy();
        GlobalAudioService.instance = null;
    }
}