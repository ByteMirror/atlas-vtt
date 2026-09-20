import { EventEmitter } from 'events';
import { Notice } from 'obsidian';
import { Howl, Howler } from 'howler';
import { getQueueService, QueueTrack } from './QueueService';
import { runInBackground } from '../utils/backgroundTask';
import { describeError } from '../utils/errors';

export interface AudioTrack {
    id: string;
    title: string;
    path: string;
    tags: string[];
    duration?: number;
    loop: boolean;
    volume: number;
    muted: boolean;
    solo: boolean;
}

export interface AudioChannelState {
    track: AudioTrack | null;
    element: HTMLAudioElement | null; // For backward compatibility
    howl?: Howl | null; // Howler.js instance
    gainNode?: GainNode | null; // For backward compatibility
    isPlaying: boolean;
    currentTime: number;
    isFading: boolean;
    timeUpdateInterval: number | undefined;
}

export class AudioService extends EventEmitter {
    private musicChannel: AudioChannelState;
    private ambienceChannel: AudioChannelState;
    private masterVolume: number = 1;
    private crossFadeDuration: number = 1500; // 1.5 seconds for softer fade
    private soloStates: Map<string, boolean> = new Map();
    private queueService = getQueueService();
    private isQueueMode: boolean = false;

    constructor() {
        super();
        this.musicChannel = this.createChannelState();
        this.ambienceChannel = this.createChannelState();
        this.setupQueueListeners();
    }

    private createChannelState(): AudioChannelState {
        return {
            track: null,
            element: null,
            howl: null,
            gainNode: null,
            isPlaying: false,
            currentTime: 0,
            isFading: false,
            timeUpdateInterval: undefined,
        };
    }

    async loadTrack(trackPath: string, channel: 'music' | 'ambience'): Promise<AudioTrack> {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        try {
            // Clean up existing track
            if (channelState.howl) {
                channelState.howl.unload();
                if (channelState.timeUpdateInterval) {
                    window.clearInterval(channelState.timeUpdateInterval);
                }
            }

            const howl = new Howl({
                src: [trackPath],
                volume: 0, // Start at 0 volume to prevent immediate playback
                loop: false,
                preload: true,
                html5: true, // Use HTML5 for better compatibility initially
                onload: () => {
                },
                onloaderror: (id, error) => {
                    console.error(`Failed to load track ${trackPath}:`, error);
                    this.emit('loaderror', channel, error);
                    new Notice(`Failed to load audio track: ${describeError(error)}`);
                },
                onplay: () => {
                    channelState.isPlaying = true;
                    this.startTimeUpdates(channel);
                    this.emit('play', channel);
                    this.updateSoloStates();
                },
                onpause: () => {
                    channelState.isPlaying = false;
                    this.stopTimeUpdates(channel);
                    this.emit('pause', channel);
                },
                onstop: () => {
                    channelState.isPlaying = false;
                    channelState.currentTime = 0;
                    this.stopTimeUpdates(channel);
                    this.emit('pause', channel);
                },
                onend: () => {
                    if (channelState.track?.loop) {
                        howl.seek(0);
                        howl.play();
                    } else {
                        channelState.isPlaying = false;
                        channelState.currentTime = 0;
                        this.stopTimeUpdates(channel);
                        this.emit('trackended', channel);
                        
                        // If in queue mode and this is the music channel, play next track
                        if (this.isQueueMode && channel === 'music') {
                            runInBackground(this.playNextInQueue(), 'Playing the next queued track');
                        }
                    }
                },
                onvolume: () => {
                    this.emit('volumechange', channel, channelState.track?.volume || 1);
                }
            });

            // For Howler.js, we don't need to wait for loading to complete
            // The track will be ready to play when needed

            const track: AudioTrack = {
                id: `${channel}-${Date.now()}`,
                title: trackPath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
                path: trackPath,
                tags: [],
                duration: howl.duration() || 0, // Duration may not be available immediately
                loop: false,
                volume: 1,
                muted: false,
                solo: false
            };

            channelState.track = track;
            channelState.howl = howl;
            channelState.element = null; // Not used with Howler.js
            channelState.gainNode = null; // Not used with Howler.js
            channelState.currentTime = 0;
            
            // Set the initial volume now that the track is loaded
            howl.volume(this.getEffectiveVolume(channel));

            return track;
        } catch (error) {
            console.error('Failed to load track:', error);
            new Notice(`Failed to load audio track: ${describeError(error)}`);
            throw error;
        }
    }

    private startTimeUpdates(channel: 'music' | 'ambience'): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.timeUpdateInterval) {
            window.clearInterval(channelState.timeUpdateInterval);
        }

        channelState.timeUpdateInterval = window.setInterval(() => {
            if (channelState.howl && channelState.isPlaying) {
                const currentTime = channelState.howl.seek() as number || 0;
                const duration = channelState.howl.duration();
                
                channelState.currentTime = currentTime;
                this.emit('timeupdate', channel, currentTime, duration);
            }
        }, 100); // Update every 100ms for smooth progress
    }

    private stopTimeUpdates(channel: 'music' | 'ambience'): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.timeUpdateInterval) {
            window.clearInterval(channelState.timeUpdateInterval);
            channelState.timeUpdateInterval = undefined;
        }
    }

    async play(channel: 'music' | 'ambience', fadein: boolean = true): Promise<void> {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (!channelState.howl) {
            return;
        }

        if (fadein && !channelState.isFading) {
            channelState.isFading = true;
            channelState.howl.volume(0);
            channelState.howl.play();
            channelState.howl.fade(0, this.getEffectiveVolume(channel), this.crossFadeDuration);
            
            window.setTimeout(() => {
                channelState.isFading = false;
            }, this.crossFadeDuration);
        } else {
            channelState.howl.volume(this.getEffectiveVolume(channel));
            channelState.howl.play();
        }
    }

    async pause(channel: 'music' | 'ambience', fadeout: boolean = true): Promise<void> {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (!channelState.howl || !channelState.isPlaying) {
            return;
        }

        if (fadeout && !channelState.isFading) {
            channelState.isFading = true;
            const currentVolume = channelState.howl.volume();
            
            channelState.howl.fade(currentVolume, 0, this.crossFadeDuration);
            
            window.setTimeout(() => {
                channelState.howl?.pause();
                channelState.isFading = false;
            }, this.crossFadeDuration);
        } else {
            channelState.howl.pause();
        }
    }

    setVolume(channel: 'music' | 'ambience', volume: number): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.track && channelState.howl) {
            channelState.track.volume = Math.max(0, Math.min(1, volume));
            
            const effectiveVolume = this.getEffectiveVolume(channel);
            channelState.howl.volume(effectiveVolume);
            
            this.emit('volumechange', channel, channelState.track.volume);
        }
    }

    setMute(channel: 'music' | 'ambience', muted: boolean): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.track && channelState.howl) {
            channelState.track.muted = muted;
            channelState.howl.mute(muted);
            this.emit('mutechange', channel, muted);
        }
    }

    setSolo(channel: 'music' | 'ambience', solo: boolean): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.track) {
            channelState.track.solo = solo;
            this.soloStates.set(channel, solo);
            this.updateSoloStates();
            this.emit('solochange', channel, solo);
        }
    }

    setLoop(channel: 'music' | 'ambience', loop: boolean): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.track && channelState.howl) {
            channelState.track.loop = loop;
            channelState.howl.loop(loop);
            this.emit('loopchange', channel, loop);
        }
    }

    seek(channel: 'music' | 'ambience', time: number): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.howl) {
            channelState.howl.seek(time);
            channelState.currentTime = time;
            this.emit('seek', channel, time);
        }
    }

    private updateSoloStates(): void {
        this.updateChannelVolume('music');
        this.updateChannelVolume('ambience');
    }

    private updateChannelVolume(channel: 'music' | 'ambience'): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (!channelState.track || !channelState.howl) return;

        const effectiveVolume = this.getEffectiveVolume(channel);
        channelState.howl.volume(effectiveVolume);
    }

    private getEffectiveVolume(channel: 'music' | 'ambience'): number {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (!channelState.track) return 0;

        let volume = 0;
        
        if (!channelState.track.muted) {
            if (channelState.track.solo || !this.isOtherChannelSolo(channel)) {
                volume = channelState.track.volume * this.masterVolume;
            }
        }

        return Math.max(0, Math.min(1, volume));
    }

    private isOtherChannelSolo(channel: 'music' | 'ambience'): boolean {
        const otherChannel = channel === 'music' ? 'ambience' : 'music';
        return this.soloStates.get(otherChannel) || false;
    }

    getChannelState(channel: 'music' | 'ambience'): AudioChannelState {
        return channel === 'music' ? this.musicChannel : this.ambienceChannel;
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
        // Update all active channels
        this.updateChannelVolume('music');
        this.updateChannelVolume('ambience');
        
        // Also update Howler's global volume
        Howler.volume(this.masterVolume);
    }

    getMasterVolume(): number {
        return this.masterVolume;
    }

    destroy(): void {
        // Stop and unload all Howl instances
        if (this.musicChannel.howl) {
            this.musicChannel.howl.unload();
        }
        if (this.ambienceChannel.howl) {
            this.ambienceChannel.howl.unload();
        }
        
        // Clear intervals
        this.stopTimeUpdates('music');
        this.stopTimeUpdates('ambience');
        
        // Remove all listeners
        this.removeAllListeners();
    }

    // Additional methods for better Howler.js integration
    fadeIn(channel: 'music' | 'ambience', duration: number = 1500): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.howl) {
            channelState.howl.volume(0);
            if (!channelState.isPlaying) {
                channelState.howl.play();
            }
            channelState.howl.fade(0, this.getEffectiveVolume(channel), duration);
        }
    }

    fadeOut(channel: 'music' | 'ambience', duration: number = 1500): void {
        const channelState = channel === 'music' ? this.musicChannel : this.ambienceChannel;
        
        if (channelState.howl && channelState.isPlaying) {
            const currentVolume = channelState.howl.volume();
            channelState.howl.fade(currentVolume, 0, duration);
            
            window.setTimeout(() => {
                channelState.howl?.pause();
            }, duration);
        }
    }

    crossFade(fromChannel: 'music' | 'ambience', toChannel: 'music' | 'ambience', duration: number = 1500): void {
        this.fadeOut(fromChannel, duration);
        window.setTimeout(() => {
            this.fadeIn(toChannel, duration);
        }, duration / 2);
    }

    // Queue-related methods
    private setupQueueListeners(): void {
        // We don't need to actively listen to queue state changes here
        // The UI components will handle that
    }

    setQueueMode(enabled: boolean): void {
        this.isQueueMode = enabled;
        this.emit('queuemodechange', enabled);
    }

    isInQueueMode(): boolean {
        return this.isQueueMode;
    }

    async playFromQueue(track: QueueTrack): Promise<void> {
        // Load and play the track
        await this.loadTrack(track.path, 'music');
        await this.play('music', true);
        
        // Update track metadata if available
        if (this.musicChannel.track) {
            this.musicChannel.track.title = track.name;
            this.musicChannel.track.tags = track.tags || [];
            if (track.duration) {
                this.musicChannel.track.duration = track.duration;
            }
        }
    }

    async playNextInQueue(): Promise<void> {
        const nextTrack = this.queueService.moveToNext();
        if (nextTrack) {
            await this.playFromQueue(nextTrack);
        } else {
            // Queue finished
            this.setQueueMode(false);
            this.emit('queuefinished');
        }
    }

    async playPreviousInQueue(): Promise<void> {
        const previousTrack = this.queueService.moveToPrevious();
        if (previousTrack) {
            await this.playFromQueue(previousTrack);
        }
    }

    async startQueuePlayback(): Promise<void> {
        this.setQueueMode(true);
        const currentTrack = this.queueService.getCurrentTrack();
        if (currentTrack) {
            await this.playFromQueue(currentTrack);
        }
    }

    stopQueuePlayback(): void {
        this.setQueueMode(false);
        void this.pause('music', true);
    }
}
