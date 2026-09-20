import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Music, Volume, Wind, Droplets, Flame, Trees, CloudRain, Plus, Edit2, X, Folder } from 'lucide-react';
import { App, Notice, TFile, normalizePath } from 'obsidian';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import type { ContextMenuEntry } from './context-menu/AtlasContextMenu';
import { AudioService, AudioTrack } from '../../services/AudioService';
import { GlobalAudioService } from '../../services/GlobalAudioService';
import { AmbientSoundService, AmbientSound } from '../../services/AmbientSoundService';
import { getQueueService, QueueTrack } from '../../services/QueueService';
import { MusicLibrary, MusicFile } from './MusicLibrary';
import { TrackCard } from './TrackCard';
import { QueueDisplay } from './QueueDisplay';
import { AmbientIconSelector } from './AmbientIconSelector';
import { getDataFilePath } from '../../utils/dataFileMigration';
import { ensureFolder } from '../../plugin/vaultFolders';
import { runInBackground } from '../../utils/backgroundTask';
import { confirmAction } from '../../ui/confirmDialog';

interface MusicPlayerProps {
    app: App;
    collectionPath: string;
}

interface SoundboardState {
    musicTracks: AudioTrack[];
    ambienceTracks: AudioTrack[];
    masterVolume: number;
}

// AmbientSound interface is now imported from AmbientSoundService

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
    app,
    collectionPath
}) => {
    const audioServiceRef = useRef<AudioService | null>(null);
    const queueService = getQueueService();
    const [soundboardState, setSoundboardState] = useState<SoundboardState>({
        musicTracks: [],
        ambienceTracks: [],
        masterVolume: 1
    });
    const [musicChannelState, setMusicChannelState] = useState({
        isPlaying: false,
        currentTime: 0,
        duration: 0
    });
    const [ambienceChannelState, setAmbienceChannelState] = useState({
        isPlaying: false,
        currentTime: 0,
        duration: 0
    });
    const [allTracks, setAllTracks] = useState<MusicFile[]>([]);
    const [ambientSounds, setAmbientSounds] = useState<AmbientSound[]>([]);
    const [draggedAmbientId, setDraggedAmbientId] = useState<string | null>(null);
    const [dragStartY, setDragStartY] = useState<number>(0);
    const [dragStartVolume, setDragStartVolume] = useState<number>(1);
    const [hasDraggedDistance, setHasDraggedDistance] = useState<boolean>(false);
    const dragStartYRef = useRef<number>(0);
    const [editingAmbientId, setEditingAmbientId] = useState<string | null>(null);
    const [editingAmbientName, setEditingAmbientName] = useState<string>('');
    const [showIconSelector, setShowIconSelector] = useState<string | null>(null);
    const ambientServiceRef = useRef<AmbientSoundService | null>(null);
    const isUpdatingAmbientSounds = useRef<boolean>(false);

    useEffect(() => {
        // Get the global audio service
        const globalAudioService = GlobalAudioService.getInstance();
        audioServiceRef.current = globalAudioService.getAudioService();
        
        // Get the ambient sound service
        ambientServiceRef.current = AmbientSoundService.getInstance();
        
        // Set up event listeners for main audio service
        const audioService = audioServiceRef.current;
        const ambientService = ambientServiceRef.current;
        
        audioService.on('timeupdate', (channel: string, currentTime: number, duration: number) => {
            if (channel === 'music') {
                setMusicChannelState(prev => ({ ...prev, currentTime, duration }));
            } else {
                setAmbienceChannelState(prev => ({ ...prev, currentTime, duration }));
            }
        });

        audioService.on('play', (channel: string) => {
            if (channel === 'music') {
                setMusicChannelState(prev => ({ ...prev, isPlaying: true }));
            } else {
                setAmbienceChannelState(prev => ({ ...prev, isPlaying: true }));
            }
        });

        audioService.on('pause', (channel: string) => {
            if (channel === 'music') {
                setMusicChannelState(prev => ({ ...prev, isPlaying: false }));
            } else {
                setAmbienceChannelState(prev => ({ ...prev, isPlaying: false }));
            }
        });

        audioService.on('volumechange', (channel: string, volume: number) => {
            setSoundboardState(prev => {
                const newState = { ...prev };
                if (channel === 'music' && prev.musicTracks[0]) {
                    // Create a new track object to ensure React detects the change
                    newState.musicTracks = [{
                        ...prev.musicTracks[0],
                        volume: volume
                    }];
                } else if (channel === 'ambience' && prev.ambienceTracks[0]) {
                    // Create a new track object to ensure React detects the change
                    newState.ambienceTracks = [{
                        ...prev.ambienceTracks[0],
                        volume: volume
                    }];
                }
                return newState;
            });
        });

        // Set up ambient sound service event listeners
        const handleAmbientSoundPlay = (soundId: string) => {
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, isPlaying: true } : s
            ));
        };
        
        const handleAmbientSoundStop = (soundId: string) => {
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, isPlaying: false } : s
            ));
        };
        
        const handleAmbientVolumeChange = (soundId: string, volume: number) => {
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, volume } : s
            ));
        };
        
        ambientService.on('soundPlay', handleAmbientSoundPlay);
        ambientService.on('soundPause', handleAmbientSoundStop);
        ambientService.on('soundStop', handleAmbientSoundStop);
        ambientService.on('soundVolumeChange', handleAmbientVolumeChange);
        
        // Load saved global state
        void loadSoundboardState();
        
        // Sync UI with current audio state
        syncWithCurrentAudioState();

        return () => {
            // Don't destroy the audio service - it should persist
            // Just clean up our local event listeners
            audioService.removeAllListeners('timeupdate');
            audioService.removeAllListeners('play');
            audioService.removeAllListeners('pause');
            audioService.removeAllListeners('volumechange');
            
            // Clean up ambient service listeners
            ambientService.removeAllListeners('soundPlay');
            ambientService.removeAllListeners('soundPause');
            ambientService.removeAllListeners('soundStop');
            ambientService.removeAllListeners('soundVolumeChange');
        };
    }, []);

    const loadSoundboardState = async () => {
        const statePath = getDataFilePath(`atlas-vtt/global-soundboard.json`);
        
        try {
            const data = await app.vault.adapter.read(statePath);
            const savedState = JSON.parse(data) as unknown as SoundboardState;
            
            // Restore tracks
            for (const track of savedState.musicTracks || []) {
                const musicFile: MusicFile = {
                    id: track.path,
                    name: track.title,
                    path: track.path,
                    tags: track.tags,
                    ...(track.duration != null && { duration: track.duration }),
                };
                await handleTrackSelect(musicFile);
            }

            for (const track of savedState.ambienceTracks || []) {
                const musicFile: MusicFile = {
                    id: track.path,
                    name: track.title,
                    path: track.path,
                    tags: track.tags,
                    ...(track.duration != null && { duration: track.duration }),
                };
                await handleTrackSelect(musicFile, 'ambience');
            }
            
            // Restore master volume
            setSoundboardState(prev => ({ ...prev, masterVolume: savedState.masterVolume || 1 }));
            audioServiceRef.current?.setMasterVolume(savedState.masterVolume || 1);
        } catch {
            // No saved global state
        }
    };

    const saveSoundboardState = async () => {
        const statePath = getDataFilePath(`atlas-vtt/global-soundboard.json`);
        
        try {
            // Ensure directory exists for the soundboard state file
            const dir = statePath.substring(0, statePath.lastIndexOf('/'));
            if (!await app.vault.adapter.exists(dir)) {
                await app.vault.adapter.mkdir(dir);
            }
            
            await app.vault.adapter.write(statePath, JSON.stringify(soundboardState));
        } catch (error) {
            console.error('Failed to save global soundboard state:', error);
        }
    };

    const syncWithCurrentAudioState = () => {
        if (!audioServiceRef.current) return;
        
        // Get current state from the audio service
        const musicState = audioServiceRef.current.getChannelState('music');
        const ambienceState = audioServiceRef.current.getChannelState('ambience');
        
        // Update UI state to match
        setSoundboardState(prev => ({
            ...prev,
            musicTracks: musicState.track ? [musicState.track] : [],
            ambienceTracks: ambienceState.track ? [ambienceState.track] : []
        }));
        
        setMusicChannelState({
            isPlaying: musicState.isPlaying,
            currentTime: musicState.currentTime,
            duration: musicState.track?.duration || 0
        });
        
        setAmbienceChannelState({
            isPlaying: ambienceState.isPlaying,
            currentTime: ambienceState.currentTime,
            duration: ambienceState.track?.duration || 0
        });
    };

    const handleTrackSelect = async (musicFile: MusicFile, targetChannel?: 'music' | 'ambience') => {
        if (!audioServiceRef.current) return;
        
        // Determine which channel to add to based on drag target or default
        const channel = targetChannel || 'music';
        
        try {
            const track = await audioServiceRef.current.loadTrack(musicFile.path, channel);
            
            setSoundboardState(prev => {
                const newState = { ...prev };
                
                if (channel === 'music') {
                    newState.musicTracks = [track]; // Replace existing track
                } else {
                    newState.ambienceTracks = [track]; // Replace existing track
                }
                
                // Save state after update
                window.setTimeout(() => { void saveSoundboardState(); }, 100);
                
                return newState;
            });
        } catch (error) {
            console.error('Failed to load track:', error);
        }
    };




    const removeTrack = (channel: 'music' | 'ambience') => {
        setSoundboardState(prev => {
            const newState = { ...prev };
            
            if (channel === 'music') {
                newState.musicTracks = [];
            } else {
                newState.ambienceTracks = [];
            }
            
            window.setTimeout(() => { void saveSoundboardState(); }, 100);
            return newState;
        });
        
        void audioServiceRef.current?.pause(channel);
    };

    const currentMusicTrack = soundboardState.musicTracks[0];
    const currentAmbienceTrack = soundboardState.ambienceTracks[0];
    
    const handleMasterPlayPause = () => {
        if (!audioServiceRef.current) return;
        
        if (musicChannelState.isPlaying) {
            void audioServiceRef.current.pause('music');
        } else if (currentMusicTrack) {
            void audioServiceRef.current.play('music');
        }
    };

    const handleTrackContextMenu = (e: React.MouseEvent, track: MusicFile) => {
        e.preventDefault();
        e.stopPropagation();

        const entries: ContextMenuEntry[] = [
            {
                type: 'item',
                label: 'Play as Music',
                icon: 'music',
                onClick: () => handleTrackSelect(track),
            },
            {
                type: 'item',
                label: 'Add to Queue',
                icon: 'list-plus',
                onClick: () => {
                    const queueTrack: QueueTrack = {
                        id: track.id,
                        path: track.path,
                        name: track.name,
                        tags: track.tags,
                        ...(track.duration != null && { duration: track.duration }),
                    };
                    queueService.addToQueue(queueTrack);
                    new Notice(`Added "${track.name}" to queue`);
                },
            },
            {
                type: 'item',
                label: 'Play Next',
                icon: 'skip-forward',
                onClick: () => {
                    const queueTrack: QueueTrack = {
                        id: track.id,
                        path: track.path,
                        name: track.name,
                        tags: track.tags,
                        ...(track.duration != null && { duration: track.duration }),
                    };
                    queueService.playNext(queueTrack);
                    new Notice(`"${track.name}" will play next`);
                },
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Add to Playlist...',
                icon: 'folder-plus',
                onClick: () => {
                },
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Delete Track',
                icon: 'trash',
                destructive: true,
                onClick: async () => {
                    const confirmed = await confirmAction({
                        title: 'Delete track',
                        message: [`Are you sure you want to delete "${track.name}"?`],
                        confirmLabel: 'Delete',
                        destructive: true,
                    });
                    if (confirmed) {
                        try {
                            const trackFile = app.vault.getFileByPath(track.id);
                            if (trackFile) await app.fileManager.trashFile(trackFile);

                            // Track metadata lives in the hidden data folder, which the Vault does not index
                            const metadataPath = getDataFilePath(track.id.replace(/\.[^/.]+$/, '.json'));
                            if (await app.vault.adapter.exists(metadataPath)) {
                                await app.vault.adapter.remove(metadataPath);
                            }
                        } catch (error) {
                            console.error('Failed to delete track:', error);
                        }
                    }
                },
            },
        ];

        openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    };

    // Ambient soundboard functions using Howler.js
    const loadAmbientSounds = async () => {
        const ambientPath = getDataFilePath(`${collectionPath}/ambient-sounds.json`);
        try {
            const data = await app.vault.adapter.read(ambientPath);
            const saved = JSON.parse(data) as { sounds?: AmbientSound[] };
            const sounds = saved.sounds || [];
            setAmbientSounds(sounds);
            
            // Restore playing state for each sound using AmbientSoundService
            sounds.forEach((sound: AmbientSound) => {
                if (sound.trackId) {
                    const track = allTracks.find(t => t.id === sound.trackId);
                    if (track && ambientServiceRef.current) {
                        // Load the sound into the service
                        ambientServiceRef.current.loadAmbientSound(sound, {
                            id: track.id,
                            name: track.name,
                            path: track.path,
                            tags: track.tags
                        });
                        
                        // If it was playing, start it
                        if (sound.isPlaying) {
                            ambientServiceRef.current.playAmbientSound(sound.id);
                        }
                    }
                }
            });
        } catch {
            // Initialize with default ambient sounds if no saved state
            const defaultSounds = [
                { id: 'wind', trackId: '', name: 'Wind', icon: 'wind', volume: 0.5, isPlaying: false },
                { id: 'rain', trackId: '', name: 'Rain', icon: 'cloud-rain', volume: 0.5, isPlaying: false },
                { id: 'water', trackId: '', name: 'Water', icon: 'droplets', volume: 0.5, isPlaying: false },
                { id: 'fire', trackId: '', name: 'Fire', icon: 'flame', volume: 0.5, isPlaying: false },
                { id: 'forest', trackId: '', name: 'Forest', icon: 'trees', volume: 0.5, isPlaying: false }
            ];
            setAmbientSounds(defaultSounds);
        }
    };

    const saveAmbientSounds = async () => {
        const ambientPath = getDataFilePath(`${collectionPath}/ambient-sounds.json`);
        try {
            // Ensure directory exists for the ambient sounds file
            const dir = ambientPath.substring(0, ambientPath.lastIndexOf('/'));
            if (!await app.vault.adapter.exists(dir)) {
                await app.vault.adapter.mkdir(dir);
            }
            
            await app.vault.adapter.write(ambientPath, JSON.stringify({
                sounds: ambientSounds
            }));
        } catch (error) {
            console.error('Failed to save ambient sounds:', error);
        }
    };

    const playAmbientSound = (soundId: string, track: MusicFile, volume: number = 1) => {
        if (!ambientServiceRef.current) return;
        
        const ambientTrack = {
            id: track.id,
            name: track.name,
            path: track.path,
            tags: track.tags
        };
        
        const sound = ambientSounds.find(s => s.id === soundId);
        if (sound) {
            // Load and play the sound
            ambientServiceRef.current.loadAmbientSound({ ...sound, trackId: track.id, volume }, ambientTrack);
            ambientServiceRef.current.playAmbientSound(soundId);
            
            // Update local state
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, isPlaying: true, trackId: track.id, volume } : s
            ));
        }
    };

    const stopAmbientSound = (soundId: string) => {
        if (!ambientServiceRef.current) return;
        
        ambientServiceRef.current.stopAmbientSound(soundId);
        
        setAmbientSounds(prev => prev.map(s => 
            s.id === soundId ? { ...s, isPlaying: false } : s
        ));
    };

    const toggleAmbientSound = (soundId: string) => {
        if (!ambientServiceRef.current) {
            console.error('Ambient service not available');
            return;
        }
        
        const sound = ambientSounds.find(s => s.id === soundId);
        if (!sound) return;
        
        if (sound.isPlaying) {
            ambientServiceRef.current.stopAmbientSound(soundId);
            // Update state to reflect the sound is stopped
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, isPlaying: false } : s
            ));
        } else if (sound.trackId) {
            const track = allTracks.find(t => t.id === sound.trackId);
            if (track) {
                // If not loaded, load first
                const ambientTrack = {
                    id: track.id,
                    name: track.name,
                    path: track.path,
                    tags: track.tags
                };
                ambientServiceRef.current.loadAmbientSound(sound, ambientTrack);
                ambientServiceRef.current.playAmbientSound(soundId);
            } else {
                console.warn(`Track not found for ambient sound ${soundId} with trackId ${sound.trackId}`);
                // Look for track by path in allTracks (might have different resource URL)
                const trackByPath = allTracks.find(t => t.id.includes(sound.trackId.split('/').pop() || ''));
                if (trackByPath) {
                    const ambientTrack = {
                        id: trackByPath.id,
                        name: trackByPath.name,
                        path: trackByPath.path,
                        tags: trackByPath.tags
                    };
                    ambientServiceRef.current.loadAmbientSound(sound, ambientTrack);
                    ambientServiceRef.current.playAmbientSound(soundId);
                } else {
                    // Last resort: try to get resource path for the file
                    const file = app.vault.getAbstractFileByPath(sound.trackId);
                    if (file instanceof TFile) {
                        try {
                            const resourcePath = app.vault.getResourcePath(file);
                            const minimalTrack = {
                                id: sound.trackId,
                                name: sound.trackId.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
                                path: resourcePath,
                                tags: ['ambient']
                            };
                            ambientServiceRef.current.loadAmbientSound(sound, minimalTrack);
                            ambientServiceRef.current.playAmbientSound(soundId);
                        } catch (e) {
                            console.error('Failed to get resource path:', e);
                            // Final fallback
                            const minimalTrack = {
                                id: sound.trackId,
                                name: sound.trackId.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
                                path: sound.trackId,
                                tags: ['ambient']
                            };
                            ambientServiceRef.current.loadAmbientSound(sound, minimalTrack);
                            ambientServiceRef.current.playAmbientSound(soundId);
                        }
                    }
                }
            }
            // Update state to reflect the sound is playing
            setAmbientSounds(prev => prev.map(s => 
                s.id === soundId ? { ...s, isPlaying: true } : s
            ));
        }
    };

    const updateAmbientVolume = (soundId: string, volume: number) => {
        if (!ambientServiceRef.current) return;
        
        ambientServiceRef.current.setAmbientVolume(soundId, volume);
        
        setAmbientSounds(prev => prev.map(s => 
            s.id === soundId ? { ...s, volume } : s
        ));
    };

    const assignTrackToAmbient = (soundId: string, track: MusicFile) => {
        if (!ambientServiceRef.current) {
            console.error('No ambient service ref');
            return;
        }
        
        // Set flag to prevent reloading while we're updating
        isUpdatingAmbientSounds.current = true;
        
        // Stop current sound if playing
        ambientServiceRef.current.stopAmbientSound(soundId);
        
        // Find the current sound
        const currentSound = ambientSounds.find(s => s.id === soundId);
        if (!currentSound) {
            console.error('Sound not found:', soundId);
            return;
        }
        
        // Update state with new track assignment
        setAmbientSounds(prev => {
            const updated = prev.map(s => 
                s.id === soundId ? { ...s, trackId: track.id, isPlaying: false } : s
            );
            // Save immediately after updating
            window.setTimeout(() => {
                isUpdatingAmbientSounds.current = false;
            }, 100);
            return updated;
        });
        
        // Load the sound immediately with the new track
        const ambientTrack = {
            id: track.id,
            name: track.name,
            path: track.path,
            tags: track.tags
        };
        // Use the current sound but with the new trackId
        ambientServiceRef.current.loadAmbientSound({ ...currentSound, trackId: track.id }, ambientTrack);
        
        // Exit edit mode if we're in it
        if (editingAmbientId === soundId) {
            setEditingAmbientId(null);
        }
    };
    
    const handleFilePickerForAmbient = async (soundId: string) => {
        // Create file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                const fileName = file.name;
                const targetPath = normalizePath(`${collectionPath}/audio/${fileName}`);
                const arrayBuffer = await file.arrayBuffer();

                await ensureFolder(app, `${collectionPath}/audio`);

                const existingFile = app.vault.getFileByPath(targetPath);
                if (existingFile) {
                    await app.vault.modifyBinary(existingFile, arrayBuffer);
                }
                const audioFile = existingFile ?? await app.vault.createBinary(targetPath, arrayBuffer);

                const musicFile: MusicFile = {
                    id: targetPath,
                    name: fileName.replace(/\.[^/.]+$/, ''),
                    path: app.vault.getResourcePath(audioFile),
                    tags: ['ambient']
                };
                
                // Assign to ambient sound
                assignTrackToAmbient(soundId, musicFile);
                
                // Update all tracks list
                setAllTracks(prev => {
                    return [...prev, musicFile];
                });
                
            } catch (error) {
                console.error('Failed to import audio file:', error);
                new Notice('Failed to import audio file');
            }
        };
        
        input.click();
    };

    const handleAmbientMouseDown = (e: React.MouseEvent, soundId: string) => {
        e.preventDefault();
        const sound = ambientSounds.find(s => s.id === soundId);
        if (!sound) {
            return;
        }
        
        setDraggedAmbientId(soundId);
        setDragStartY(e.clientY);
        dragStartYRef.current = e.clientY; // Store in ref for accurate comparison
        setDragStartVolume(sound.volume);
        setHasDraggedDistance(false);
    };

    const handleAmbientMouseMove = (e: MouseEvent) => {
        if (!draggedAmbientId) return;
        
        const deltaY = dragStartY - e.clientY;
        
        // Mark as dragged if moved more than 3 pixels (more sensitive)
        if (Math.abs(deltaY) > 3) {
            setHasDraggedDistance(true);
            
            // Only update volume if we've moved enough
            const volumeDelta = deltaY / 100; // 100px = 100% volume change
            const newVolume = Math.max(0, Math.min(1, dragStartVolume + volumeDelta));
            
            updateAmbientVolume(draggedAmbientId, newVolume);
        }
    };

    const handleAmbientMouseUp = (e: MouseEvent) => {
        if (draggedAmbientId) {
            const deltaY = Math.abs(dragStartYRef.current - e.clientY);
            // Double-check: if we moved at all vertically, don't treat as click
            if (!hasDraggedDistance && deltaY < 3) {
                const soundId = draggedAmbientId;
                // Small delay to ensure state is cleared first
                window.setTimeout(() => {
                    toggleAmbientSound(soundId);
                }, 0);
            } else {
                // Save if we actually dragged
                void saveAmbientSounds();
            }
        }
        setDraggedAmbientId(null);
        setHasDraggedDistance(false);
        dragStartYRef.current = 0;
    };

    const getAmbientIcon = (iconName: string, size: number = 18) => {
        // Handle legacy lowercase icon names and provide direct icon mapping
        const iconMap: Record<string, React.ReactNode> = {
            'wind': <Wind size={size} />,
            'Wind': <Wind size={size} />,
            'cloud-rain': <CloudRain size={size} />,
            'CloudRain': <CloudRain size={size} />,
            'droplets': <Droplets size={size} />,
            'Droplets': <Droplets size={size} />,
            'flame': <Flame size={size} />,
            'Flame': <Flame size={size} />,
            'trees': <Trees size={size} />,
            'Trees': <Trees size={size} />,
            'Music': <Music size={size} />,
            'Volume2': <Volume2 size={size} />,
            'Volume': <Volume size={size} />
        };
        
        return iconMap[iconName] || <Music size={size} />;
    };

    // Add mouse event listeners for ambient volume dragging
    useEffect(() => {
        if (draggedAmbientId) {
            document.addEventListener('mousemove', handleAmbientMouseMove);
            document.addEventListener('mouseup', handleAmbientMouseUp);
            
            return () => {
                document.removeEventListener('mousemove', handleAmbientMouseMove);
                document.removeEventListener('mouseup', handleAmbientMouseUp);
            };
        }
    }, [draggedAmbientId, dragStartVolume, dragStartY]);

    // Load ambient sounds when tracks are loaded
    useEffect(() => {
        if (allTracks.length > 0 && !isUpdatingAmbientSounds.current) {
            void loadAmbientSounds();
        }
    }, [allTracks]);

    // Update ambient audio volumes when master volume changes
    useEffect(() => {
        if (ambientServiceRef.current) {
            ambientServiceRef.current.setMasterVolume(soundboardState.masterVolume);
        }
    }, [soundboardState.masterVolume]);

    // Save ambient sounds when they change
    useEffect(() => {
        if (ambientSounds.length > 0) {
            // Debounce the save to avoid saving too frequently
            const saveTimeout = window.setTimeout(() => {
                void saveAmbientSounds();
            }, 1000);
            
            return () => window.clearTimeout(saveTimeout);
        }
    }, [ambientSounds]);
    
    // Handle clicks outside of editing area to exit edit mode
    useEffect(() => {
        if (editingAmbientId) {
            const handleClickOutside = (e: MouseEvent) => {
                const target = e.target as HTMLElement;
                // Check if click is outside the editing ambient button
                const editingButton = document.querySelector(`.atlas-ambient-button.editing`);
                if (editingButton && !editingButton.contains(target)) {
                    // Save the name change
                    setAmbientSounds(prev => prev.map(s => 
                        s.id === editingAmbientId ? { ...s, name: editingAmbientName } : s
                    ));
                    setEditingAmbientId(null);
                }
            };
            
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [editingAmbientId, editingAmbientName]);

    return (
        <div className="atlas-music-player">
            {/* Left Column - Library */}
            <div className="atlas-music-sidebar">
                <MusicLibrary
                    collectionPath={collectionPath}
                    app={app}
                    onTrackSelect={(musicFile) => runInBackground(handleTrackSelect(musicFile), 'Selecting a track')}
                    onTracksLoaded={setAllTracks}
                    onTrackDeleted={(deletedTrackId) => {
                        // Remove from all tracks
                        setAllTracks(prev => prev.filter(t => t.id !== deletedTrackId));
                    }}
                    masterVolume={soundboardState.masterVolume}
                    onMasterVolumeChange={(volume) => {
                        setSoundboardState(prev => ({ ...prev, masterVolume: volume }));
                        audioServiceRef.current?.setMasterVolume(volume);
                        void saveSoundboardState();
                    }}
                    isPlaying={musicChannelState.isPlaying}
                    onMasterPlayPause={handleMasterPlayPause}
                />
            </div>
            
            {/* Middle Column - Now Playing */}
            <div className="atlas-playlist-view">
                {/* Now Playing Section */}
                <div className="atlas-now-playing-section">
                    <div className="atlas-now-playing-header">
                        <h2>Now Playing</h2>
                    </div>
                    
                    <div className="atlas-active-tracks">
                        {currentMusicTrack && (
                            <div className="atlas-track-section">
                                <h3>Music</h3>
                                <TrackCard
                                    track={currentMusicTrack}
                                    channel="music"
                                    isPlaying={musicChannelState.isPlaying}
                                    currentTime={musicChannelState.currentTime}
                                    duration={musicChannelState.duration}
                                    onPlay={() => { void audioServiceRef.current?.play('music'); }}
                                    onPause={() => { void audioServiceRef.current?.pause('music'); }}
                                    onVolumeChange={(v) => audioServiceRef.current?.setVolume('music', v)}
                                    onMuteToggle={() => audioServiceRef.current?.setMute('music', !currentMusicTrack.muted)}
                                    onSoloToggle={() => audioServiceRef.current?.setSolo('music', !currentMusicTrack.solo)}
                                    onLoopToggle={() => audioServiceRef.current?.setLoop('music', !currentMusicTrack.loop)}
                                    onSeek={(t) => audioServiceRef.current?.seek('music', t)}
                                    onRemove={() => removeTrack('music')}
                                />
                            </div>
                        )}
                        
                        {currentAmbienceTrack && (
                            <div className="atlas-track-section">
                                <h3>Ambience</h3>
                                <TrackCard
                                    track={currentAmbienceTrack}
                                    channel="ambience"
                                    isPlaying={ambienceChannelState.isPlaying}
                                    currentTime={ambienceChannelState.currentTime}
                                    duration={ambienceChannelState.duration}
                                    onPlay={() => { void audioServiceRef.current?.play('ambience'); }}
                                    onPause={() => { void audioServiceRef.current?.pause('ambience'); }}
                                    onVolumeChange={(v) => audioServiceRef.current?.setVolume('ambience', v)}
                                    onMuteToggle={() => audioServiceRef.current?.setMute('ambience', !currentAmbienceTrack.muted)}
                                    onSoloToggle={() => audioServiceRef.current?.setSolo('ambience', !currentAmbienceTrack.solo)}
                                    onLoopToggle={() => audioServiceRef.current?.setLoop('ambience', !currentAmbienceTrack.loop)}
                                    onSeek={(t) => audioServiceRef.current?.seek('ambience', t)}
                                    onRemove={() => removeTrack('ambience')}
                                />
                            </div>
                        )}
                        
                        {!currentMusicTrack && !currentAmbienceTrack && (
                            <div className="atlas-empty-now-playing">
                                <Music size={48} />
                                <h3>Nothing playing</h3>
                                <p>Drag tracks from your library to start playing music and ambience</p>
                            </div>
                        )}
                        
                        {/* Queue Section */}
                        <QueueDisplay />
                    </div>
                </div>
            </div>
            
            {/* Right Column - Ambient Soundboard */}
            <div className="atlas-ambient-soundboard">
                <div className="atlas-ambient-header">
                    <h3>Ambient Sounds</h3>
                    <span className="atlas-ambient-hint">Click to play/stop • Drag up/down for volume</span>
                </div>
                <div className="atlas-ambient-buttons">
                    {ambientSounds.map(sound => {
                        const hasTrack = !!sound.trackId;
                        const track = allTracks.find(t => t.id === sound.trackId);
                        const isEditing = editingAmbientId === sound.id;
                        
                        return (
                            <div
                                key={sound.id}
                                className={`atlas-ambient-button ${sound.isPlaying ? 'playing' : ''} ${hasTrack ? 'has-track' : ''} ${isEditing ? 'editing' : ''}`}
                                style={{
                                    '--volume': sound.volume
                                } as React.CSSProperties}
                            >
                                {isEditing ? (
                                    <>
                                        <button
                                            className="atlas-ambient-icon-button"
                                            onClick={() => setShowIconSelector(sound.id)}
                                            title="Change icon"
                                        >
                                            {getAmbientIcon(sound.icon)}
                                        </button>
                                        <input
                                            type="text"
                                            className="atlas-ambient-name-input"
                                            value={editingAmbientName}
                                            onChange={(e) => setEditingAmbientName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    setAmbientSounds(prev => prev.map(s => 
                                                        s.id === sound.id ? { ...s, name: editingAmbientName } : s
                                                    ));
                                                    setEditingAmbientId(null);
                                                }
                                                if (e.key === 'Escape') {
                                                    setEditingAmbientId(null);
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            className="atlas-ambient-file-button"
                                            onClick={() => runInBackground(handleFilePickerForAmbient(sound.id), 'Choosing an ambient sound file')}
                                            title="Choose audio file"
                                        >
                                            <Folder size={14} />
                                        </button>
                                        <button
                                            className="atlas-ambient-delete-button"
                                            onClick={() => {
                                                if (ambientServiceRef.current) {
                                                    ambientServiceRef.current.removeAmbientSound(sound.id);
                                                }
                                                setAmbientSounds(prev => prev.filter(s => s.id !== sound.id));
                                                setEditingAmbientId(null);
                                            }}
                                            title="Delete"
                                        >
                                            <X size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div
                                            className="atlas-ambient-main-area"
                                            onMouseDown={(e) => {
                                                if (hasTrack) {
                                                    handleAmbientMouseDown(e, sound.id);
                                                }
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.add('drag-over');
                                            }}
                                            onDragLeave={(e) => {
                                                e.currentTarget.classList.remove('drag-over');
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.remove('drag-over');
                                                const trackData = e.dataTransfer.getData('musicTrack');
                                                if (trackData) {
                                                    const track = JSON.parse(trackData) as unknown as MusicFile;
                                                    assignTrackToAmbient(sound.id, track);
                                                }
                                            }}
                                            title={track ? `${track.name} - Click to play/stop, drag up/down for volume` : 'Drop a track here to assign'}
                                        >
                                            {getAmbientIcon(sound.icon)}
                                            <span className="atlas-ambient-label">{sound.name}</span>
                                        </div>
                                        <button
                                            className="atlas-ambient-edit-button"
                                            onClick={() => {
                                                setEditingAmbientId(sound.id);
                                                setEditingAmbientName(sound.name);
                                            }}
                                            title="Edit"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                    </>
                                )}
                                
                                {showIconSelector === sound.id && (
                                    <div className="atlas-icon-selector-overlay">
                                        <AmbientIconSelector
                                            value={sound.icon}
                                            onChange={(iconName) => {
                                                setAmbientSounds(prev => prev.map(s => 
                                                    s.id === sound.id ? { ...s, icon: iconName } : s
                                                ));
                                                setShowIconSelector(null);
                                            }}
                                            onClose={() => setShowIconSelector(null)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    
                    <button
                        className="atlas-ambient-button atlas-ambient-add"
                        onClick={() => {
                            const newSound: AmbientSound = {
                                id: `ambient-${Date.now()}`,
                                trackId: '',
                                name: 'New Sound',
                                icon: 'Music',
                                volume: 0.5,
                                isPlaying: false
                            };
                            setAmbientSounds(prev => [...prev, newSound]);
                            // Automatically enter edit mode for the new sound
                            setEditingAmbientId(newSound.id);
                            setEditingAmbientName(newSound.name);
                        }}
                        title="Add ambient sound"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};