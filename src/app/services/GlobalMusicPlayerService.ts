import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from 'obsidian';
import { StandaloneMusicPlayer } from '../react/components/StandaloneMusicPlayer';

/**
 * Service to manage the standalone music player modal
 */
export class GlobalMusicPlayerService {
    private app: App;
    private container: HTMLDivElement | null = null;
    private root: Root | null = null;
    private isOpen: boolean = false;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Open the standalone music player modal
     */
    open(): void {
        if (this.isOpen) {
            return; // Already open
        }

        this.isOpen = true;

        try {
            // Create container
            this.container = document.body.createDiv();
            this.container.addClasses(['atlas-vtt-plugin', 'atlas-standalone-music-container']);
            // Create React root and render
            this.root = createRoot(this.container);
            this.root.render(
                React.createElement(StandaloneMusicPlayer, {
                    app: this.app,
                    onClose: () => this.close()
                })
            );
        } catch (error) {
            console.error('Error in GlobalMusicPlayerService.open():', error);
            this.isOpen = false;
        }
    }

    /**
     * Close the standalone music player modal
     */
    close(): void {
        if (!this.isOpen || !this.container || !this.root) {
            return;
        }

        this.isOpen = false;

        // Unmount and remove container
        this.root.unmount();
        document.body.removeChild(this.container);
        this.container = null;
        this.root = null;
    }

    /**
     * Check if the music player is currently open
     */
    isPlayerOpen(): boolean {
        return this.isOpen;
    }

    /**
     * Toggle the music player
     */
    toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Clean up service
     */
    destroy(): void {
        this.close();
    }
}