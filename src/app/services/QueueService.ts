import { type App } from 'obsidian';

const QUEUE_STATE_KEY = 'atlas-vtt-queue-state';

export interface QueueTrack {
    id: string;
    path: string;
    name: string;
    duration?: number;
    tags?: string[];
    isFromPlaylist?: boolean;
    playlistId?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
    tracks: QueueTrack[];
    nextInQueue: QueueTrack[]; // Priority queue for "Play Next" functionality
    currentIndex: number;
    repeatMode: RepeatMode;
    shuffle: boolean;
    shuffledIndices?: number[];
    history: QueueTrack[];
}

export class QueueService {
    private state: QueueState = {
        tracks: [],
        nextInQueue: [],
        currentIndex: -1,
        repeatMode: 'off',
        shuffle: false,
        history: []
    };

    private listeners: Set<(state: QueueState) => void> = new Set();

    private app: App | null = null;

    /**
     * Binds the queue to a vault so its state persists per vault. Until this is
     * called the queue lives in memory only.
     */
    attachApp(app: App): void {
        if (this.app) return;
        this.app = app;
        this.loadState();
    }

    // State management
    private saveState(): void {
        const stateToSave = {
            ...this.state,
            // Don't save history to avoid large files
            history: []
        };
        this.app?.saveLocalStorage(QUEUE_STATE_KEY, stateToSave);
    }

    private loadState(): void {
        try {
            const saved: unknown = this.app?.loadLocalStorage(QUEUE_STATE_KEY);
            if (saved && typeof saved === 'object') {
                const loaded = saved as Partial<QueueState>;
                this.state = {
                    ...this.state,
                    ...loaded,
                    history: [] // Always start with empty history
                };
            }
        } catch (e) {
            console.error('Failed to load queue state:', e);
        }
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.getState()));
        this.saveState();
    }

    // Public API
    subscribe(listener: (state: QueueState) => void): () => void {
        this.listeners.add(listener);
        listener(this.getState()); // Initial state
        return () => this.listeners.delete(listener);
    }

    getState(): QueueState {
        return { ...this.state };
    }

    // Queue operations
    addToQueue(track: QueueTrack): void {
        this.state.tracks.push(track);
        if (this.state.currentIndex === -1) {
            this.state.currentIndex = 0;
        }
        this.notifyListeners();
    }

    addToQueueMultiple(tracks: QueueTrack[]): void {
        this.state.tracks.push(...tracks);
        if (this.state.currentIndex === -1 && tracks.length > 0) {
            this.state.currentIndex = 0;
        }
        this.notifyListeners();
    }

    playNext(track: QueueTrack): void {
        this.state.nextInQueue.push(track);
        this.notifyListeners();
    }

    playNextMultiple(tracks: QueueTrack[]): void {
        this.state.nextInQueue.push(...tracks);
        this.notifyListeners();
    }

    removeFromQueue(index: number): void {
        if (index < 0 || index >= this.state.tracks.length) return;

        this.state.tracks.splice(index, 1);
        
        // Adjust current index if needed
        if (index < this.state.currentIndex) {
            this.state.currentIndex--;
        } else if (index === this.state.currentIndex) {
            // If we removed the current track, stay at the same index
            // (which now points to the next track)
            if (this.state.currentIndex >= this.state.tracks.length) {
                this.state.currentIndex = this.state.tracks.length - 1;
            }
        }

        this.notifyListeners();
    }

    removeFromNextInQueue(index: number): void {
        if (index >= 0 && index < this.state.nextInQueue.length) {
            this.state.nextInQueue.splice(index, 1);
            this.notifyListeners();
        }
    }

    clearQueue(): void {
        this.state.tracks = [];
        this.state.nextInQueue = [];
        this.state.currentIndex = -1;
        delete this.state.shuffledIndices;
        this.notifyListeners();
    }

    clearNextInQueue(): void {
        this.state.nextInQueue = [];
        this.notifyListeners();
    }

    // Playback control
    getCurrentTrack(): QueueTrack | null {
        // Check nextInQueue first
        if (this.state.nextInQueue.length > 0) {
            return this.state.nextInQueue[0] ?? null;
        }

        if (this.state.currentIndex >= 0 && this.state.currentIndex < this.state.tracks.length) {
            return this.state.tracks[this.state.currentIndex] ?? null;
        }

        return null;
    }

    moveToNext(): QueueTrack | null {
        // Add current track to history
        const current = this.getCurrentTrack();
        if (current) {
            this.state.history.push(current);
            // Keep history size reasonable
            if (this.state.history.length > 50) {
                this.state.history.shift();
            }
        }

        // Check nextInQueue first
        if (this.state.nextInQueue.length > 0) {
            const nextTrack = this.state.nextInQueue.shift()!;
            this.notifyListeners();
            return nextTrack;
        }

        // Handle regular queue
        if (this.state.tracks.length === 0) {
            this.state.currentIndex = -1;
            this.notifyListeners();
            return null;
        }

        if (this.state.repeatMode === 'one') {
            // Stay on current track
            this.notifyListeners();
            return this.getCurrentTrack();
        }

        let nextIndex: number;

        if (this.state.shuffle && this.state.shuffledIndices) {
            // Find current position in shuffled order
            const currentShufflePos = this.state.shuffledIndices.indexOf(this.state.currentIndex);
            const nextShufflePos = currentShufflePos + 1;

            if (nextShufflePos >= this.state.shuffledIndices.length) {
                if (this.state.repeatMode === 'all') {
                    // Reshuffle for next cycle
                    this.generateShuffledIndices();
                    nextIndex = this.state.shuffledIndices[0]!;
                } else {
                    // End of queue
                    this.state.currentIndex = -1;
                    this.notifyListeners();
                    return null;
                }
            } else {
                nextIndex = this.state.shuffledIndices[nextShufflePos]!;
            }
        } else {
            // Normal sequential playback
            nextIndex = this.state.currentIndex + 1;

            if (nextIndex >= this.state.tracks.length) {
                if (this.state.repeatMode === 'all') {
                    nextIndex = 0;
                } else {
                    // End of queue
                    this.state.currentIndex = -1;
                    this.notifyListeners();
                    return null;
                }
            }
        }

        this.state.currentIndex = nextIndex;
        this.notifyListeners();
        return this.state.tracks[nextIndex] ?? null;
    }

    moveToPrevious(): QueueTrack | null {
        if (this.state.tracks.length === 0) {
            return null;
        }

        // If we have history, use it
        if (this.state.history.length > 0) {
            const previousTrack = this.state.history.pop()!;
            
            // Find the track in the queue
            const index = this.state.tracks.findIndex(t => t.id === previousTrack.id);
            if (index !== -1) {
                this.state.currentIndex = index;
                this.notifyListeners();
                return this.state.tracks[index] ?? null;
            }
        }

        // Otherwise, go to previous in queue
        let prevIndex: number;

        if (this.state.shuffle && this.state.shuffledIndices) {
            const currentShufflePos = this.state.shuffledIndices.indexOf(this.state.currentIndex);
            const prevShufflePos = currentShufflePos - 1;

            if (prevShufflePos < 0) {
                if (this.state.repeatMode === 'all') {
                    prevIndex = this.state.shuffledIndices[this.state.shuffledIndices.length - 1]!;
                } else {
                    prevIndex = 0;
                }
            } else {
                prevIndex = this.state.shuffledIndices[prevShufflePos]!;
            }
        } else {
            prevIndex = this.state.currentIndex - 1;

            if (prevIndex < 0) {
                if (this.state.repeatMode === 'all') {
                    prevIndex = this.state.tracks.length - 1;
                } else {
                    prevIndex = 0;
                }
            }
        }

        this.state.currentIndex = prevIndex;
        this.notifyListeners();
        return this.state.tracks[prevIndex] ?? null;
    }

    jumpToTrack(index: number): QueueTrack | null {
        if (index >= 0 && index < this.state.tracks.length) {
            // Add current to history
            const current = this.getCurrentTrack();
            if (current) {
                this.state.history.push(current);
            }

            this.state.currentIndex = index;
            this.notifyListeners();
            return this.state.tracks[index] ?? null;
        }
        return null;
    }

    // Queue manipulation
    moveTrack(fromIndex: number, toIndex: number): void {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.state.tracks.length) return;
        if (toIndex < 0 || toIndex >= this.state.tracks.length) return;

        const movedTrack = this.state.tracks.splice(fromIndex, 1)[0]!;
        this.state.tracks.splice(toIndex, 0, movedTrack);

        // Adjust current index
        if (this.state.currentIndex === fromIndex) {
            this.state.currentIndex = toIndex;
        } else if (fromIndex < this.state.currentIndex && toIndex >= this.state.currentIndex) {
            this.state.currentIndex--;
        } else if (fromIndex > this.state.currentIndex && toIndex <= this.state.currentIndex) {
            this.state.currentIndex++;
        }

        // Regenerate shuffle if active
        if (this.state.shuffle) {
            this.generateShuffledIndices();
        }

        this.notifyListeners();
    }

    moveNextInQueueTrack(fromIndex: number, toIndex: number): void {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.state.nextInQueue.length) return;
        if (toIndex < 0 || toIndex >= this.state.nextInQueue.length) return;

        const movedTrack = this.state.nextInQueue.splice(fromIndex, 1)[0]!;
        this.state.nextInQueue.splice(toIndex, 0, movedTrack);

        this.notifyListeners();
    }

    // Playback modes
    setRepeatMode(mode: RepeatMode): void {
        this.state.repeatMode = mode;
        this.notifyListeners();
    }

    setShuffle(enabled: boolean): void {
        this.state.shuffle = enabled;
        
        if (enabled) {
            this.generateShuffledIndices();
        } else {
            delete this.state.shuffledIndices;
        }

        this.notifyListeners();
    }

    private generateShuffledIndices(): void {
        const indices = Array.from({ length: this.state.tracks.length }, (_, i) => i);
        
        // Fisher-Yates shuffle, excluding current index
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j]!, indices[i]!];
        }

        // Ensure current track is first in shuffled order
        if (this.state.currentIndex >= 0) {
            const currentPos = indices.indexOf(this.state.currentIndex);
            if (currentPos > 0) {
                [indices[0], indices[currentPos]] = [indices[currentPos]!, indices[0]!];
            }
        }

        this.state.shuffledIndices = indices;
    }

    // Replace entire queue (for playlist loading)
    replaceQueue(tracks: QueueTrack[]): void {
        this.state.tracks = tracks;
        this.state.nextInQueue = [];
        this.state.currentIndex = tracks.length > 0 ? 0 : -1;
        delete this.state.shuffledIndices;
        this.state.history = [];

        if (this.state.shuffle && tracks.length > 0) {
            this.generateShuffledIndices();
        }

        this.notifyListeners();
    }
}

// Singleton instance
let queueServiceInstance: QueueService | null = null;

export function getQueueService(): QueueService {
    if (!queueServiceInstance) {
        queueServiceInstance = new QueueService();
    }
    return queueServiceInstance;
}