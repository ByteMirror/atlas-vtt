import React, { useState, useEffect, useMemo } from 'react';
import { Search, Music, FolderOpen, Tag, Plus, X, Volume2, Play, Pause, ChevronRight, ChevronDown } from 'lucide-react';
import { TFile, TFolder, Notice, Modal, App, normalizePath } from 'obsidian';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import type { ContextMenuEntry } from './context-menu/AtlasContextMenu';
import { PlaylistModal } from './PlaylistModal';
import { Slider } from '../../packages/components/primitives/slider';
import { getDataFilePath } from '../../utils/dataFileMigration';
import { ensureFolder } from '../../plugin/vaultFolders';
import './music-library-modals.scss';
import { runInBackground } from '../../utils/backgroundTask';
import { confirmAction } from '../../ui/confirmDialog';

export interface MusicFile {
    id: string;
    name: string;
    path: string;
    tags: string[];
    duration?: number;
}

export interface Playlist {
    id: string;
    name: string;
    tracks: string[]; // track IDs
}

// Rename Modal class
class RenameTrackModal extends Modal {
    private currentName: string;
    private onRename: (newName: string) => Promise<void>;

    constructor(app: App, currentName: string, onRename: (newName: string) => Promise<void>) {
        super(app);
        this.currentName = currentName;
        this.onRename = onRename;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        this.titleEl.setText('Rename track');
        
        contentEl.createEl('p', { text: 'Enter new name for the track:' });
        
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            value: this.currentName,
            cls: 'atlas-music-modal-input'
        });
        
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container atlas-music-modal-buttons' });
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        const renameButton = buttonContainer.createEl('button', { 
            text: 'Rename',
            cls: 'mod-cta'
        });
        
        const performRename = () => {
            const newName = inputEl.value.trim();
            if (newName && newName !== this.currentName) {
                runInBackground(this.onRename(newName), 'Renaming', 'Rename failed');
                this.close();
            }
        };
        
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performRename();
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
        
        cancelButton.addEventListener('click', () => this.close());
        renameButton.addEventListener('click', performRename);
        
        // Focus and select input
        inputEl.focus();
        inputEl.select();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Rename Playlist Modal class
class RenamePlaylistModal extends Modal {
    private currentName: string;
    private onRename: (newName: string) => Promise<void>;

    constructor(app: App, currentName: string, onRename: (newName: string) => Promise<void>) {
        super(app);
        this.currentName = currentName;
        this.onRename = onRename;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        this.titleEl.setText('Rename playlist');
        
        contentEl.createEl('p', { text: 'Enter new name for the playlist:' });
        
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            value: this.currentName,
            cls: 'atlas-music-modal-input'
        });
        
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container atlas-music-modal-buttons' });
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        const renameButton = buttonContainer.createEl('button', { 
            text: 'Rename',
            cls: 'mod-cta'
        });
        
        const performRename = () => {
            const newName = inputEl.value.trim();
            if (newName && newName !== this.currentName) {
                runInBackground(this.onRename(newName), 'Renaming', 'Rename failed');
                this.close();
            }
        };
        
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performRename();
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
        
        cancelButton.addEventListener('click', () => this.close());
        renameButton.addEventListener('click', performRename);
        
        // Focus and select input
        inputEl.focus();
        inputEl.select();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

interface MusicLibraryProps {
    collectionPath: string;
    app: any;
    onTrackSelect: (track: MusicFile) => void;
    onTracksLoaded?: (tracks: MusicFile[]) => void;
    onTrackDeleted?: (trackId: string) => void;
    masterVolume: number;
    onMasterVolumeChange: (volume: number) => void;
    isPlaying: boolean;
    onMasterPlayPause: () => void;
}

export const MusicLibrary: React.FC<MusicLibraryProps> = ({
    collectionPath,
    app,
    onTrackSelect,
    onTracksLoaded,
    onTrackDeleted,
    masterVolume,
    onMasterVolumeChange,
    isPlaying,
    onMasterPlayPause
}) => {
    const [tracks, setTracks] = useState<MusicFile[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [showTagInput, setShowTagInput] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [selectedTrackForTag, setSelectedTrackForTag] = useState<string | null>(null);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [activeView, setActiveView] = useState<'playlists' | 'tracks'>('playlists');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedPlaylists, setExpandedPlaylists] = useState<Set<string>>(new Set());

    useEffect(() => {
        const loadLibrary = async (): Promise<void> => {
            await ensureMusicFolderExists();
            await Promise.all([loadMusicFiles(), loadPlaylists()]);
        };
        runInBackground(loadLibrary(), 'Loading the music library', 'Could not load the music library');
    }, [collectionPath]);

    // Auto-switch to tracks view if no playlists exist and user is on playlists view
    useEffect(() => {
        if (activeView === 'playlists' && playlists.length === 0 && tracks.length > 0) {
            setActiveView('tracks');
        }
    }, [playlists.length, tracks.length, activeView]);

    const trashVaultFile = async (path: string): Promise<void> => {
        const file = app.vault.getFileByPath(path);
        if (file) await app.fileManager.trashFile(file);
    };

    const ensureMusicFolderExists = async () => {
        const musicPath = `${collectionPath}/music`;
        
        try {
            if (!app.vault.getFolderByPath(musicPath)) {
                await ensureFolder(app, musicPath);
                // Create a README file to explain the folder's purpose
                const readmePath = `${musicPath}/README.md`;
                const readmeContent = `# Music & Ambience Folder

This folder contains audio files for your Atlas VTT maps.

## Supported Formats
- MP3 (.mp3)
- WAV (.wav)
- OGG (.ogg)
- M4A (.m4a)
- FLAC (.flac)

## How to Use
1. Drop your audio files into this folder
2. They will automatically appear in the Music Library sidebar
3. Drag tracks from the library to the Music or Ambience channels
4. Each map remembers its own soundboard configuration

## Organization Tips
- Use descriptive filenames (e.g., "tavern-ambience.mp3", "battle-music-epic.mp3")
- Add tags to your tracks in the Music Library for easy filtering
- Create playlists to group related tracks together
`;
                if (!app.vault.getFileByPath(readmePath)) {
                    await app.vault.create(readmePath, readmeContent);
                }
            }
        } catch (error) {
            console.error('Failed to create music folder:', error);
        }
    };

    const loadMusicFiles = async () => {
        const musicPath = `${collectionPath}/music`;
        const folder = app.vault.getAbstractFileByPath(musicPath);
        
        if (folder instanceof TFolder) {
            const musicFiles: MusicFile[] = [];
            
            for (const file of folder.children) {
                if (file instanceof TFile && isAudioFile(file.name)) {
                    const metadata = await loadTrackMetadata(file.path);
                    musicFiles.push({
                        id: file.path,
                        name: file.basename,
                        path: (app.vault.adapter as any).getResourcePath(file.path),
                        tags: metadata.tags || [],
                        ...(metadata.duration != null && { duration: metadata.duration }),
                    });
                }
            }
            
            setTracks(musicFiles);
            if (onTracksLoaded) {
                onTracksLoaded(musicFiles);
            }
        }
    };

    const loadPlaylists = async () => {
        // First, determine the proper path for playlists
        let playlistPath: string;
        
        // Check if we're dealing with a collection path
        if (collectionPath.startsWith('atlas-vtt/collections/')) {
            // Extract collection name from path
            const collectionMatch = collectionPath.match(/^atlas-vtt\/collections\/([^/]+)/);
            if (collectionMatch) {
                const collectionName = collectionMatch[1];
                // Try new location first
                playlistPath = `atlas-vtt/.atlas-data/collections/${collectionName}/playlists.json`;
            } else {
                // Fallback to direct path if pattern doesn't match
                playlistPath = getDataFilePath(`${collectionPath}/playlists.json`);
            }
        } else {
            // For non-collection paths, use the standard approach
            playlistPath = getDataFilePath(`${collectionPath}/playlists.json`);
        }
        
        try {
            // Try to read from the new location first
            const data = await app.vault.adapter.read(playlistPath);
            const parsed = JSON.parse(data) as { playlists?: Playlist[] };
            setPlaylists(parsed.playlists || []);
        } catch {
            // If new location fails, try old location as fallback
            const oldPlaylistPath = `${collectionPath}/playlists.json`;

            if (playlistPath !== oldPlaylistPath) {
                try {
                    const data = await app.vault.adapter.read(oldPlaylistPath);
                    const parsed = JSON.parse(data) as { playlists?: Playlist[] };
                    setPlaylists(parsed.playlists || []);
                    // Optionally migrate the file to new location
                    try {
                        // Ensure the new directory exists
                        const newDir = playlistPath.substring(0, playlistPath.lastIndexOf('/'));
                        if (!await app.vault.adapter.exists(newDir)) {
                            await app.vault.adapter.mkdir(newDir);
                        }
                        
                        // Copy to new location
                        await app.vault.adapter.write(playlistPath, data);
                        
                        await trashVaultFile(oldPlaylistPath);
                    } catch (migrationError) {
                        console.error('Failed to migrate playlists file:', migrationError);
                    }
                } catch {
                    // No playlists file exists in either location
                    setPlaylists([]);
                }
            } else {
                // No playlists file yet
                setPlaylists([]);
            }
        }
    };

    const loadTrackMetadata = async (path: string): Promise<{ tags: string[], duration?: number }> => {
        // Replace file extension with .json to get metadata filename
        const metadataFilename = path.replace(/\.[^/.]+$/, '.json');
        
        // Try new location first
        const newPath = getDataFilePath(metadataFilename);
        
        try {
            const data = await app.vault.adapter.read(newPath);
            return JSON.parse(data) as { tags: string[]; duration?: number };
        } catch {
            // If new location fails, try old location as fallback
            if (newPath !== metadataFilename) {
                try {
                    const data = await app.vault.adapter.read(metadataFilename);
                    const parsed = JSON.parse(data) as { tags: string[]; duration?: number };
                    // Optionally migrate to new location
                    try {
                        // Ensure the new directory exists
                        const newDir = newPath.substring(0, newPath.lastIndexOf('/'));
                        if (!await app.vault.adapter.exists(newDir)) {
                            await app.vault.adapter.mkdir(newDir);
                        }
                        
                        // Copy to new location
                        await app.vault.adapter.write(newPath, data);
                        
                        await trashVaultFile(metadataFilename);
                    } catch (migrationError) {
                        console.error('Failed to migrate track metadata file:', migrationError);
                    }
                    
                    return parsed;
                } catch {
                    // Neither location has the metadata file
                    return { tags: [] };
                }
            } else {
                // No fallback needed if paths are the same
                return { tags: [] };
            }
        }
    };

    const saveTrackMetadata = async (track: MusicFile) => {
        const metadataPath = getDataFilePath(track.id.replace(/\.[^/.]+$/, '.json'));
        
        try {
            // Ensure the .metadata directory exists
            const metadataDir = metadataPath.substring(0, metadataPath.lastIndexOf('/'));
            if (!await app.vault.adapter.exists(metadataDir)) {
                await app.vault.adapter.mkdir(metadataDir);
            }
            
            await app.vault.adapter.write(metadataPath, JSON.stringify({
                tags: track.tags,
                duration: track.duration
            }));
        } catch (error) {
            console.error('Failed to save track metadata:', error);
        }
    };

    const isAudioFile = (filename: string): boolean => {
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
        return audioExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    };

    const filteredTracks = useMemo(() => {
        return tracks.filter(track => {
            const matchesSearch = track.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesTags = selectedTags.length === 0 || 
                selectedTags.some(tag => track.tags.includes(tag));
            
            return matchesSearch && matchesTags;
        });
    }, [tracks, searchQuery, selectedTags]);

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        tracks.forEach(track => track.tags.forEach(tag => tagSet.add(tag)));
        return Array.from(tagSet).sort();
    }, [tracks]);

    const handleDragStart = (e: React.DragEvent, track: MusicFile) => {
        e.dataTransfer.setData('musicTrack', JSON.stringify(track));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleAddTag = (trackId: string) => {
        if (!newTag.trim()) return;
        
        const track = tracks.find(t => t.id === trackId);
        if (track && !track.tags.includes(newTag)) {
            track.tags.push(newTag);
            void saveTrackMetadata(track);
            setTracks([...tracks]);
        }
        
        setNewTag('');
        setShowTagInput(false);
        setSelectedTrackForTag(null);
    };

    const togglePlaylistExpansion = (playlistId: string) => {
        const newExpanded = new Set(expandedPlaylists);
        if (newExpanded.has(playlistId)) {
            newExpanded.delete(playlistId);
        } else {
            newExpanded.add(playlistId);
        }
        setExpandedPlaylists(newExpanded);
    };

    const handleRemoveTag = (trackId: string, tag: string) => {
        const track = tracks.find(t => t.id === trackId);
        if (track) {
            track.tags = track.tags.filter(t => t !== tag);
            void saveTrackMetadata(track);
            setTracks([...tracks]);
        }
    };

    const createPlaylist = (name: string) => {
        const newPlaylist: Playlist = {
            id: Date.now().toString(),
            name,
            tracks: []
        };
        
        const updatedPlaylists = [...playlists, newPlaylist];
        setPlaylists(updatedPlaylists);
        void savePlaylists(updatedPlaylists);
    };

    const savePlaylists = async (playlistsToSave: Playlist[]) => {
        // Use the same logic as loadPlaylists to determine the correct path
        let playlistPath: string;
        
        // Check if we're dealing with a collection path
        if (collectionPath.startsWith('atlas-vtt/collections/')) {
            // Extract collection name from path
            const collectionMatch = collectionPath.match(/^atlas-vtt\/collections\/([^/]+)/);
            if (collectionMatch) {
                const collectionName = collectionMatch[1];
                // Use new location
                playlistPath = `atlas-vtt/.atlas-data/collections/${collectionName}/playlists.json`;
            } else {
                // Fallback to direct path if pattern doesn't match
                playlistPath = getDataFilePath(`${collectionPath}/playlists.json`);
            }
        } else {
            // For non-collection paths, use the standard approach
            playlistPath = getDataFilePath(`${collectionPath}/playlists.json`);
        }
        
        try {
            // Ensure directory exists for the playlist file
            const dir = playlistPath.substring(0, playlistPath.lastIndexOf('/'));
            if (!await app.vault.adapter.exists(dir)) {
                await app.vault.adapter.mkdir(dir);
            }
            
            await app.vault.adapter.write(playlistPath, JSON.stringify({
                playlists: playlistsToSave
            }, null, 2));
        } catch (error) {
            console.error('Failed to save playlists:', error);
        }
    };

    const deleteTrack = async (track: MusicFile) => {
        try {
            await trashVaultFile(track.id);

            // Track metadata lives in the hidden data folder, which the Vault does not index
            const metadataPath = getDataFilePath(track.id.replace(/\.[^/.]+$/, '.json'));
            if (await app.vault.adapter.exists(metadataPath)) {
                await app.vault.adapter.remove(metadataPath);
            }

            // Remove from local state
            setTracks(tracks.filter(t => t.id !== track.id));

            // Remove from all playlists
            const updatedPlaylists = playlists.map(playlist => ({
                ...playlist,
                tracks: playlist.tracks.filter(trackId => trackId !== track.id)
            }));
            setPlaylists(updatedPlaylists);
            await savePlaylists(updatedPlaylists);

            // Notify parent component
            if (onTrackDeleted) {
                onTrackDeleted(track.id);
            }
        } catch (error) {
            console.error('Failed to delete track:', error);
        }
    };

    const addTrackToPlaylist = (trackId: string, playlistId: string) => {
        const playlist = playlists.find(p => p.id === playlistId);
        if (playlist && !playlist.tracks.includes(trackId)) {
            const updatedPlaylist = {
                ...playlist,
                tracks: [...playlist.tracks, trackId]
            };
            const updatedPlaylists = playlists.map(p => 
                p.id === playlistId ? updatedPlaylist : p
            );
            setPlaylists(updatedPlaylists);
            void savePlaylists(updatedPlaylists);
        }
    };

    const removeTrackFromPlaylist = (trackId: string, playlistId: string) => {
        const playlist = playlists.find(p => p.id === playlistId);
        if (playlist) {
            const updatedPlaylist = {
                ...playlist,
                tracks: playlist.tracks.filter(id => id !== trackId)
            };
            const updatedPlaylists = playlists.map(p => 
                p.id === playlistId ? updatedPlaylist : p
            );
            setPlaylists(updatedPlaylists);
            void savePlaylists(updatedPlaylists);
        }
    };

    const deletePlaylist = async (playlist: Playlist) => {
        const updatedPlaylists = playlists.filter(p => p.id !== playlist.id);
        setPlaylists(updatedPlaylists);
        await savePlaylists(updatedPlaylists);
        new Notice(`Deleted playlist "${playlist.name}"`);
    };

    const renamePlaylist = async (playlistId: string, newName: string) => {
        const updatedPlaylists = playlists.map(p => 
            p.id === playlistId ? { ...p, name: newName } : p
        );
        setPlaylists(updatedPlaylists);
        await savePlaylists(updatedPlaylists);
        new Notice(`Renamed playlist to "${newName}"`);
    };

    const assignTagToPlaylistTracks = async (playlist: Playlist, tag: string) => {
        let updatedCount = 0;
        
        // Update each track in the playlist
        for (const trackId of playlist.tracks) {
            const track = tracks.find(t => t.id === trackId);
            if (track && !track.tags.includes(tag)) {
                track.tags.push(tag);
                await saveTrackMetadata(track);
                updatedCount++;
            }
        }
        
        // Refresh the tracks state to trigger re-render
        setTracks([...tracks]);
        
        if (updatedCount > 0) {
            new Notice(`Added tag "${tag}" to ${updatedCount} track(s)`);
        } else {
            new Notice(`All tracks already have the tag "${tag}"`);
        }
    };


    const showTrackContextMenu = (e: React.MouseEvent, track: MusicFile): void => {
        e.preventDefault();
        e.stopPropagation();

        const playlistChildren: ContextMenuEntry[] = playlists.map((playlist) => ({
            type: 'item' as const,
            label: playlist.name,
            onClick: () => addTrackToPlaylist(track.id, playlist.id),
        }));

        const entries: ContextMenuEntry[] = [
            {
                type: 'item',
                label: 'Play Track',
                icon: 'play',
                onClick: () => onTrackSelect(track),
            },
            { type: 'separator' },
            ...(playlistChildren.length > 0
                ? [{ type: 'submenu' as const, label: 'Add to Playlist', icon: 'folder-plus', children: playlistChildren }]
                : [{ type: 'item' as const, label: 'Add to Playlist', icon: 'folder-plus', disabled: true, onClick: () => {} }]),
            { type: 'separator' },
            {
                type: 'item',
                label: 'Rename Track...',
                icon: 'pencil',
                onClick: async () => {
                    const currentName = track.name;

                    const modal = new RenameTrackModal(app, currentName, async (newName) => {
                        try {
                            const vaultPath = track.id;
                            const extension = vaultPath.substring(vaultPath.lastIndexOf('.'));
                            const directory = vaultPath.substring(0, vaultPath.lastIndexOf('/'));
                            const newVaultPath = `${directory}/${newName}${extension}`;


                            if (vaultPath === newVaultPath) {
                                return;
                            }

                            if (app.vault.getAbstractFileByPath(newVaultPath)) {
                                new Notice(`A file named "${newName}${extension}" already exists`);
                                return;
                            }

                            const file = app.vault.getAbstractFileByPath(vaultPath);
                            if (!file || !(file instanceof TFile)) {
                                throw new Error(`File not found in vault: ${vaultPath}`);
                            }

                            await app.fileManager.renameFile(file, newVaultPath);

                            const metadataPath = getDataFilePath(vaultPath.replace(/\.[^/.]+$/, '.json'));
                            const newMetadataPath = getDataFilePath(newVaultPath.replace(/\.[^/.]+$/, '.json'));

                            // Hidden data files are not indexed by the Vault, so they are renamed through the adapter
                            if (await app.vault.adapter.exists(metadataPath)) {
                                await app.vault.adapter.rename(metadataPath, newMetadataPath);
                            }

                            const updatedPlaylists = playlists.map((playlist) => {
                                if (playlist.tracks.includes(vaultPath)) {
                                    return {
                                        ...playlist,
                                        tracks: playlist.tracks.map((trackPath) =>
                                            trackPath === vaultPath ? newVaultPath : trackPath
                                        ),
                                    };
                                }
                                return playlist;
                            });

                            const hasUpdatedPlaylists = updatedPlaylists.some(
                                (playlist, index) =>
                                    playlist.tracks.join(',') !== playlists[index]!.tracks.join(',')
                            );

                            if (hasUpdatedPlaylists) {
                                await savePlaylists(updatedPlaylists);
                                setPlaylists(updatedPlaylists);
                            }

                            await loadMusicFiles();
                            new Notice(`Renamed "${currentName}" to "${newName}"`);

                            if (onTrackDeleted) {
                                onTrackDeleted(track.id);
                            }
                        } catch (error: any) {
                            console.error('Failed to rename track:', error);
                            new Notice(`Failed to rename track: ${error.message || error}`);
                        }
                    });

                    modal.open();
                },
            },
            {
                type: 'item',
                label: 'Add Tag...',
                icon: 'tag',
                onClick: () => {
                    setSelectedTrackForTag(track.id);
                    setShowTagInput(true);
                },
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Show in File Explorer',
                icon: 'folder',
                onClick: async () => {
                    try {
                        const file = app.vault.getAbstractFileByPath(track.id);
                        if (!file || !(file instanceof TFile)) {
                            throw new Error('File not found in vault');
                        }

                        const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];
                        if (fileExplorer && fileExplorer.view) {
                            app.workspace.revealLeaf(fileExplorer);
                            if ((fileExplorer.view as any).revealInFolder) {
                                (fileExplorer.view as any).revealInFolder(file);
                            }
                        } else {
                            await app.workspace.getLeftLeaf(false).setViewState({
                                type: 'file-explorer',
                            });
                            window.setTimeout(() => {
                                const newFileExplorer = app.workspace.getLeavesOfType('file-explorer')[0];
                                if (
                                    newFileExplorer &&
                                    newFileExplorer.view &&
                                    (newFileExplorer.view as any).revealInFolder
                                ) {
                                    (newFileExplorer.view as any).revealInFolder(file);
                                }
                            }, 100);
                        }

                        new Notice(`Revealed "${track.name}" in file explorer`);
                    } catch (error: any) {
                        console.error('Failed to show track in file explorer:', error);
                        new Notice(`Failed to show track in file explorer: ${error.message}`);
                    }
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
                    if (confirmed) await deleteTrack(track);
                },
            },
        ];

        openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    };

    const showPlaylistContextMenu = (e: React.MouseEvent, playlist: Playlist): void => {
        e.preventDefault();
        e.stopPropagation();

        const tagChildren: ContextMenuEntry[] = allTags.map((tag) => ({
            type: 'item' as const,
            label: tag,
            onClick: () => assignTagToPlaylistTracks(playlist, tag),
        }));
        tagChildren.push({
            type: 'item',
            label: 'Add New Tag...',
            onClick: () => {
                const modal = new Modal(app);
                modal.titleEl.setText('Add tag to all tracks');
                const inputContainer = modal.contentEl.createDiv({ cls: 'atlas-music-tag-input-container' });
                const input = inputContainer.createEl('input', {
                    type: 'text',
                    placeholder: 'Enter tag name',
                    cls: 'atlas-music-tag-input',
                });

                const buttonContainer = modal.contentEl.createDiv({
                    cls: 'modal-button-container atlas-music-modal-buttons atlas-music-modal-buttons--spaced',
                });

                const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
                const addButton = buttonContainer.createEl('button', {
                    text: 'Add tag',
                    cls: 'mod-cta',
                });

                const addTag = (): void => {
                    const tagName = input.value.trim();
                    if (tagName) {
                        void assignTagToPlaylistTracks(playlist, tagName);
                        modal.close();
                    }
                };

                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') {
                        addTag();
                    } else if (ev.key === 'Escape') {
                        modal.close();
                    }
                });

                cancelButton.addEventListener('click', () => modal.close());
                addButton.addEventListener('click', addTag);

                modal.open();
                input.focus();
            },
        });

        const entries: ContextMenuEntry[] = [
            {
                type: 'item',
                label: 'Load Playlist',
                icon: 'play',
                onClick: () => {
                    const firstTrackId = playlist.tracks[0];
                    if (firstTrackId) {
                        const firstTrack = tracks.find(t => t.id === firstTrackId);
                        if (firstTrack) {
                            onTrackSelect(firstTrack);
                        }
                    }
                },
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Rename Playlist...',
                icon: 'pencil',
                onClick: () => {
                    const modal = new RenamePlaylistModal(app, playlist.name, async (newName) => {
                        await renamePlaylist(playlist.id, newName);
                    });
                    modal.open();
                },
            },
            {
                type: 'submenu',
                label: 'Assign Tag to All Tracks',
                icon: 'tag',
                children: tagChildren,
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Delete Playlist',
                icon: 'trash',
                destructive: true,
                onClick: async () => {
                    const confirmed = await confirmAction({
                        title: 'Delete playlist',
                        message: [`Are you sure you want to delete the playlist "${playlist.name}"?`],
                        confirmLabel: 'Delete',
                        destructive: true,
                    });
                    if (confirmed) await deletePlaylist(playlist);
                },
            },
        ];

        openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    };

    const handleAddButtonClick = (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();

        const entries: ContextMenuEntry[] = [
            {
                type: 'item',
                label: 'New Playlist',
                icon: 'folder-plus',
                onClick: () => setShowPlaylistModal(true),
            },
            { type: 'separator' },
            {
                type: 'item',
                label: 'Add Music Tracks...',
                icon: 'file-audio',
                onClick: async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.mp3,.wav,.ogg,.m4a,.flac';
                    input.multiple = true;

                    input.onchange = async (event) => {
                        const files = (event.target as HTMLInputElement).files;
                        if (!files || files.length === 0) return;

                        const musicPath = `${collectionPath}/music`;

                        await ensureFolder(app, musicPath);

                        for (const file of files) {
                            try {
                                const arrayBuffer = await file.arrayBuffer();
                                const filePath = normalizePath(`${musicPath}/${file.name}`);
                                const existingFile = app.vault.getFileByPath(filePath);

                                if (existingFile) {
                                    const shouldOverwrite = await confirmAction({
                                        title: 'Overwrite file',
                                        message: [`File "${file.name}" already exists. Overwrite?`],
                                        confirmLabel: 'Overwrite',
                                        destructive: true,
                                    });
                                    if (!shouldOverwrite) continue;
                                    await app.vault.modifyBinary(existingFile, arrayBuffer);
                                } else {
                                    await app.vault.createBinary(filePath, arrayBuffer);
                                }
                            } catch (error: any) {
                                console.error(`Failed to add file ${file.name}:`, error);
                                new Notice(`Failed to add ${file.name}: ${error.message}`);
                            }
                        }

                        await loadMusicFiles();
                        new Notice(`Added ${files.length} music track(s)`);
                    };

                    input.click();
                },
            },
        ];

        openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    };

    return (
        <div className="atlas-music-library">
            <div className="atlas-music-library-header">
                <h3>Your Library</h3>
                <button className="atlas-library-add-button" onClick={handleAddButtonClick} title="Add new...">
                    <Plus size={24} />
                </button>
            </div>

            <div className="atlas-library-filters">
                <div className="atlas-filter-pills">
                    <button 
                        className={`atlas-filter-pill ${activeView === 'playlists' ? 'active' : ''}`}
                        onClick={() => setActiveView('playlists')}
                    >
                        Playlists
                    </button>
                    <button 
                        className={`atlas-filter-pill ${activeView === 'tracks' ? 'active' : ''}`}
                        onClick={() => setActiveView('tracks')}
                    >
                        Tracks
                    </button>
                </div>
            </div>

            <div className="atlas-library-controls">
                <button 
                    className={`atlas-search-button ${showSearch ? 'active' : ''}`} 
                    onClick={() => setShowSearch(!showSearch)}
                    title="Search"
                >
                    <Search size={16} />
                </button>
                <div className="atlas-sort-controls">
                    <span className="atlas-sort-label">Recents</span>
                    <button className="atlas-sort-button" title="Sort options">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>
                        </svg>
                    </button>
                </div>
            </div>

            {showSearch && (
                <div className="atlas-library-search">
                    <input
                        type="text"
                        placeholder="Search in Your Library"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="atlas-library-search-input"
                        autoFocus
                    />
                </div>
            )}

            {allTags.length > 0 && (
                <div className="atlas-music-tags">
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            className={`atlas-tag-button ${selectedTags.includes(tag) ? 'active' : ''}`}
                            onClick={() => {
                                if (selectedTags.includes(tag)) {
                                    setSelectedTags(selectedTags.filter(t => t !== tag));
                                } else {
                                    setSelectedTags([...selectedTags, tag]);
                                }
                            }}
                        >
                            <Tag size={14} />
                            {tag}
                        </button>
                    ))}
                </div>
            )}

            <div className="atlas-music-sections">
                {activeView === 'playlists' && (
                    <div className="atlas-playlist-list">
                        {playlists.length === 0 ? (
                            <div className="atlas-music-empty-state">
                                <FolderOpen size="80px" />
                                <p>No playlists yet</p>
                                <span>Create your first playlist to organize your tracks</span>
                            </div>
                        ) : (
                            playlists.map(playlist => {
                                const isExpanded = expandedPlaylists.has(playlist.id);
                                return (
                                    <div key={playlist.id} className="atlas-playlist-container">
                                        <div
                                            className="atlas-playlist-item"
                                            onClick={() => togglePlaylistExpansion(playlist.id)}
                                            onContextMenu={(e) => showPlaylistContextMenu(e, playlist)}
                                        >
                                            <div className="atlas-playlist-chevron">
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </div>
                                            <div className="atlas-playlist-icon">
                                                <FolderOpen size={20} />
                                            </div>
                                            <div className="atlas-playlist-info">
                                                <div className="atlas-playlist-name">{playlist.name}</div>
                                                <div className="atlas-playlist-meta">
                                                    Playlist • {playlist.tracks.length} tracks
                                                </div>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="atlas-playlist-tracks">
                                                {playlist.tracks.length === 0 ? (
                                                    <div className="atlas-playlist-empty">No tracks in this playlist</div>
                                                ) : (
                                                    playlist.tracks.map((trackId) => {
                                                        const track = tracks.find(t => t.id === trackId);
                                                        if (!track) return null;
                                                        return (
                                                            <div
                                                                key={track.id}
                                                                className="atlas-playlist-track"
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, track)}
                                                                onDoubleClick={() => onTrackSelect(track)}
                                                                onContextMenu={(e) => showTrackContextMenu(e, track)}
                                                            >
                                                                <div className="atlas-track-icon">
                                                                    <Music size={16} />
                                                                </div>
                                                                <div className="atlas-track-info">
                                                                    <div className="atlas-playlist-track-name">{track.name}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {activeView === 'tracks' && (
                    <div className="atlas-track-list">
                        {filteredTracks.length === 0 ? (
                            <div className="atlas-music-empty-state">
                                <Music size="80px" />
                                <p>No audio files found</p>
                                <span>Add MP3, WAV, OGG, M4A, or FLAC files to:</span>
                                <code>{collectionPath}/music/</code>
                            </div>
                        ) : (
                            filteredTracks.map(track => (
                            <div
                                key={track.id}
                                className="atlas-library-track"
                                draggable
                                onDragStart={(e) => handleDragStart(e, track)}
                                onDoubleClick={() => onTrackSelect(track)}
                                onContextMenu={(e) => showTrackContextMenu(e, track)}
                            >
                                <div className="atlas-track-icon">
                                    <Music size={20} />
                                </div>
                                <div className="atlas-track-info">
                                    <div className="atlas-library-track-name">{track.name}</div>
                                    <div className="atlas-library-track-tags">
                                        {track.tags.map(tag => (
                                            <span key={tag} className="atlas-library-tag">
                                                {tag}
                                                <button
                                                    className="atlas-tag-remove"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveTag(track.id, tag);
                                                    }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                        {selectedTrackForTag === track.id && showTagInput ? (
                                            <input
                                                type="text"
                                                className="atlas-tag-input"
                                                value={newTag}
                                                onChange={(e) => setNewTag(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleAddTag(track.id);
                                                    } else if (e.key === 'Escape') {
                                                        setShowTagInput(false);
                                                        setSelectedTrackForTag(null);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    setShowTagInput(false);
                                                    setSelectedTrackForTag(null);
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            <button
                                                className="atlas-add-tag-button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTrackForTag(track.id);
                                                    setShowTagInput(true);
                                                }}
                                            >
                                                <Plus size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )))
                        }
                    </div>
                )}
            </div>
            
            {/* Master Controls */}
            <div className="atlas-master-controls">
                <div className="atlas-master-volume-control">
                    <Volume2 size={20} />
                    <span>Master</span>
                    <Slider
                        value={[masterVolume * 100]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value: number[]) => {
                            const volume = (value[0] ?? masterVolume * 100) / 100;
                            onMasterVolumeChange(volume);
                        }}
                        className="atlas-master-volume-slider"
                    />
                    <span className="atlas-volume-percentage">{Math.round(masterVolume * 100)}%</span>
                </div>
                <button
                    className="atlas-master-play-pause"
                    onClick={onMasterPlayPause}
                    title={isPlaying ? 'Pause All' : 'Play All'}
                >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
            </div>
            
            <PlaylistModal
                isOpen={showPlaylistModal}
                onClose={() => setShowPlaylistModal(false)}
                onConfirm={createPlaylist}
                title="Create New Playlist"
            />
        </div>
    );
};