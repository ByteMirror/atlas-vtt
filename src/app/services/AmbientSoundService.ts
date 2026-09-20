import { Howl } from 'howler';
import { EventEmitter } from 'events';

export interface AmbientSound {
    id: string;
    trackId: string;
    name: string;
    icon: string;
    volume: number;
    isPlaying: boolean;
}

export interface AmbientTrack {
    id: string;
    name: string;
    path: string;
    tags: string[];
}

interface HowlInstance {
    howl: Howl;
    sound: AmbientSound;
    fadeInterval: number | undefined;
}

export class AmbientSoundService extends EventEmitter {
    private static instance: AmbientSoundService;
    private howlInstances: Map<string, HowlInstance> = new Map();
    private masterVolume: number = 1;
    private globalMute: boolean = false;

    static getInstance(): AmbientSoundService {
        if (!AmbientSoundService.instance) {
            AmbientSoundService.instance = new AmbientSoundService();
        }
        return AmbientSoundService.instance;
    }

    private constructor() {
        super();
    }

    /**
     * Load and prepare an ambient sound for playback
     */
    loadAmbientSound(sound: AmbientSound, track: AmbientTrack): void {
        // Stop existing sound if any
        this.stopAmbientSound(sound.id);

        try {
            const howl = new Howl({
                src: [track.path],
                loop: true,
                volume: sound.volume * this.masterVolume,
                preload: true,
                html5: true, // Use HTML5 for better compatibility with Obsidian
                onload: () => {
                    this.emit('soundLoaded', sound.id, track);
                },
                onloaderror: (id, error) => {
                    console.error(`Failed to load ambient sound ${sound.name}:`, error);
                    console.error('Track path was:', track.path);
                    this.emit('soundError', sound.id, error);
                },
                onplay: () => {
                    this.emit('soundPlay', sound.id);
                },
                onpause: () => {
                    this.emit('soundPause', sound.id);
                },
                onstop: () => {
                    this.emit('soundStop', sound.id);
                },
                onvolume: () => {
                    this.emit('soundVolumeChange', sound.id, howl.volume());
                }
            });

            this.howlInstances.set(sound.id, {
                howl,
                sound: { ...sound, trackId: track.id },
                fadeInterval: undefined,
            });

        } catch (error) {
            console.error(`Error creating Howl instance for ${sound.name}:`, error);
            this.emit('soundError', sound.id, error);
        }
    }

    /**
     * Play an ambient sound with fade in
     */
    playAmbientSound(soundId: string, fadeIn: boolean = true): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            console.warn(`Ambient sound ${soundId} not loaded`);
            return;
        }

        if (this.globalMute) {
            instance.howl.mute(true);
        }

        if (fadeIn) {
            const targetVolume = instance.sound.volume * this.masterVolume;
            instance.howl.volume(0);
            instance.howl.play();
            instance.howl.fade(0, targetVolume, 1500); // 1.5 second fade in
        } else {
            instance.howl.play();
        }
        instance.sound.isPlaying = true;
    }

    /**
     * Stop an ambient sound with fade out
     */
    stopAmbientSound(soundId: string, fadeOut: boolean = true): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        // Clear any fade intervals
        if (instance.fadeInterval) {
            window.clearInterval(instance.fadeInterval);
            instance.fadeInterval = undefined;
        }

        if (fadeOut && instance.howl.playing()) {
            const currentVolume = instance.howl.volume();
            instance.howl.fade(currentVolume, 0, 1500); // 1.5 second fade out
            
            window.setTimeout(() => {
                instance.howl.stop();
                instance.sound.isPlaying = false;
            }, 1500);
        } else {
            instance.howl.stop();
            instance.sound.isPlaying = false;
        }
    }

    /**
     * Pause an ambient sound (can be resumed) with fade out
     */
    pauseAmbientSound(soundId: string, fadeOut: boolean = true): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        if (fadeOut && instance.howl.playing()) {
            const currentVolume = instance.howl.volume();
            instance.howl.fade(currentVolume, 0, 1500); // 1.5 second fade out
            
            window.setTimeout(() => {
                instance.howl.pause();
                instance.sound.isPlaying = false;
            }, 1500);
        } else {
            instance.howl.pause();
            instance.sound.isPlaying = false;
        }
    }

    /**
     * Toggle play/pause for an ambient sound
     */
    toggleAmbientSound(soundId: string): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        if (instance.sound.isPlaying) {
            this.pauseAmbientSound(soundId);
        } else {
            this.playAmbientSound(soundId);
        }
    }

    /**
     * Set volume for a specific ambient sound
     */
    setAmbientVolume(soundId: string, volume: number): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        // Clamp volume between 0 and 1
        const clampedVolume = Math.max(0, Math.min(1, volume));
        
        instance.sound.volume = clampedVolume;
        instance.howl.volume(clampedVolume * this.masterVolume);
    }

    /**
     * Fade in an ambient sound
     */
    fadeInAmbientSound(soundId: string, duration: number = 2000): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        const targetVolume = instance.sound.volume * this.masterVolume;
        instance.howl.volume(0);
        instance.howl.fade(0, targetVolume, duration);
        
        if (!instance.sound.isPlaying) {
            this.playAmbientSound(soundId);
        }
    }

    /**
     * Fade out an ambient sound
     */
    fadeOutAmbientSound(soundId: string, duration: number = 2000): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        const currentVolume = instance.howl.volume();
        instance.howl.fade(currentVolume, 0, duration);
        
        // Stop the sound after fade completes
        window.setTimeout(() => {
            this.stopAmbientSound(soundId);
        }, duration);
    }

    /**
     * Set master volume for all ambient sounds
     */
    setMasterVolume(volume: number): void {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        this.masterVolume = clampedVolume;

        // Update all active instances
        this.howlInstances.forEach((instance) => {
            instance.howl.volume(instance.sound.volume * this.masterVolume);
        });

        this.emit('masterVolumeChange', this.masterVolume);
    }

    /**
     * Get current master volume
     */
    getMasterVolume(): number {
        return this.masterVolume;
    }

    /**
     * Mute/unmute all ambient sounds
     */
    setGlobalMute(muted: boolean): void {
        this.globalMute = muted;
        
        this.howlInstances.forEach((instance) => {
            instance.howl.mute(muted);
        });

        this.emit('globalMuteChange', this.globalMute);
    }

    /**
     * Get global mute state
     */
    isGlobalMuted(): boolean {
        return this.globalMute;
    }

    /**
     * Get ambient sound state
     */
    getAmbientSoundState(soundId: string): AmbientSound | null {
        const instance = this.howlInstances.get(soundId);
        return instance ? { ...instance.sound } : null;
    }

    /**
     * Get all ambient sound states
     */
    getAllAmbientSounds(): AmbientSound[] {
        return Array.from(this.howlInstances.values()).map(instance => ({ ...instance.sound }));
    }

    /**
     * Remove an ambient sound completely
     */
    removeAmbientSound(soundId: string): void {
        const instance = this.howlInstances.get(soundId);
        if (!instance) {
            return;
        }

        // Clear any fade intervals
        if (instance.fadeInterval) {
            window.clearInterval(instance.fadeInterval);
        }

        // Unload the Howl instance
        instance.howl.unload();
        
        // Remove from map
        this.howlInstances.delete(soundId);

        this.emit('soundRemoved', soundId);
    }

    /**
     * Stop and remove all ambient sounds
     */
    clearAllAmbientSounds(): void {
        this.howlInstances.forEach((instance, soundId) => {
            this.removeAmbientSound(soundId);
        });
    }

    /**
     * Get current playback position for debugging
     */
    getAmbientSoundPosition(soundId: string): number {
        const instance = this.howlInstances.get(soundId);
        if (!instance || !instance.sound.isPlaying) {
            return 0;
        }

        return instance.howl.seek();
    }

    /**
     * Get whether a sound is currently playing
     */
    isAmbientSoundPlaying(soundId: string): boolean {
        const instance = this.howlInstances.get(soundId);
        return instance ? instance.sound.isPlaying && instance.howl.playing() : false;
    }

    /**
     * Preload multiple ambient sounds for better performance
     */
    preloadAmbientSounds(sounds: AmbientSound[], tracks: AmbientTrack[]): void {
        sounds.forEach(sound => {
            const track = tracks.find(t => t.id === sound.trackId);
            if (track) {
                this.loadAmbientSound(sound, track);
            }
        });
    }

    /**
     * Export current state for persistence
     */
    exportState(): any {
        return {
            masterVolume: this.masterVolume,
            globalMute: this.globalMute,
            sounds: this.getAllAmbientSounds()
        };
    }

    /**
     * Import state for restoration
     */
    importState(state: any): void {
        if (state.masterVolume !== undefined) {
            this.setMasterVolume(state.masterVolume);
        }
        
        if (state.globalMute !== undefined) {
            this.setGlobalMute(state.globalMute);
        }
    }
}
