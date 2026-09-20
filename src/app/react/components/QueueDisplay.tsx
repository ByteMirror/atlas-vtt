import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Trash2,
  X,
  GripVertical,
} from 'lucide-react';
import { getQueueService, QueueState, RepeatMode } from '../../services/QueueService';
import { GlobalAudioService } from '../../services/GlobalAudioService';
import './queue-display.scss';
import { runInBackground } from '../../utils/backgroundTask';

export const QueueDisplay: React.FC = () => {
    const [queueState, setQueueState] = useState<QueueState>(getQueueService().getState());
    const [isPlaying, setIsPlaying] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [draggedType, setDraggedType] = useState<'queue' | 'nextInQueue' | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const audioService = GlobalAudioService.getInstance().getAudioService();
    const queueService = getQueueService();

    useEffect(() => {
        // Subscribe to queue state changes
        const unsubscribe = queueService.subscribe(setQueueState);

        // Subscribe to audio service events
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        audioService.on('play', handlePlay);
        audioService.on('pause', handlePause);

        return () => {
            unsubscribe();
            audioService.off('play', handlePlay);
            audioService.off('pause', handlePause);
        };
    }, []);

    const handlePlayPause = async () => {
        if (!audioService.isInQueueMode()) {
            // Start queue playback
            await audioService.startQueuePlayback();
        } else if (isPlaying) {
            await audioService.pause('music');
        } else {
            await audioService.play('music');
        }
    };

    const handleNext = async () => {
        await audioService.playNextInQueue();
    };

    const handlePrevious = async () => {
        await audioService.playPreviousInQueue();
    };

    const handleShuffle = () => {
        queueService.setShuffle(!queueState.shuffle);
    };

    const handleRepeat = () => {
        const modes: RepeatMode[] = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(queueState.repeatMode);
        const nextMode = modes[(currentIndex + 1) % modes.length] ?? 'off';
        queueService.setRepeatMode(nextMode);
    };

    const handleClearQueue = () => {
        queueService.clearQueue();
        audioService.stopQueuePlayback();
    };

    const handleRemoveTrack = (index: number) => {
        queueService.removeFromQueue(index);
    };

    const handleRemoveFromNextInQueue = (index: number) => {
        queueService.removeFromNextInQueue(index);
    };

    const handleJumpToTrack = async (index: number) => {
        const track = queueService.jumpToTrack(index);
        if (track) {
            await audioService.playFromQueue(track);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getRepeatIcon = () => {
        switch (queueState.repeatMode) {
            case 'one':
                return <Repeat1 className="queue-control-icon active" />;
            case 'all':
                return <Repeat className="queue-control-icon active" />;
            default:
                return <Repeat className="queue-control-icon" />;
        }
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, index: number, type: 'queue' | 'nextInQueue') => {
        setDraggedIndex(index);
        setDraggedType(type);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number, dropType: 'queue' | 'nextInQueue') => {
        e.preventDefault();
        
        if (draggedIndex === null || draggedType === null) return;
        
        if (draggedType === dropType) {
            // Moving within the same list
            if (draggedType === 'queue') {
                queueService.moveTrack(draggedIndex, dropIndex);
            } else {
                queueService.moveNextInQueueTrack(draggedIndex, dropIndex);
            }
        }
        
        // Reset drag state
        setDraggedIndex(null);
        setDraggedType(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDraggedType(null);
        setDragOverIndex(null);
    };

    const totalTracks = queueState.tracks.length + queueState.nextInQueue.length;

    // Don't show queue section if there are no tracks
    if (totalTracks === 0) {
        return null;
    }

    return (
        <div className="queue-display">
            <div className="queue-section-header">
                <h3>Queue</h3>
                <span className="queue-count">{totalTracks} tracks</span>
            </div>

            <div className="queue-controls">
                <div className="queue-playback-controls">
                    <button 
                        className="queue-control-button"
                        onClick={() => runInBackground(handlePrevious(), 'Playing the previous track')}
                        disabled={totalTracks === 0}
                        aria-label="Previous track"
                    >
                        <SkipBack className="queue-control-icon" />
                    </button>
                    
                    <button 
                        className="queue-control-button play-button"
                        onClick={() => runInBackground(handlePlayPause(), 'Toggling queue playback')}
                        disabled={totalTracks === 0}
                        aria-label={isPlaying ? "Pause" : "Play"}
                    >
                        {isPlaying ? 
                            <Pause className="queue-control-icon" /> : 
                            <Play className="queue-control-icon" />
                        }
                    </button>
                    
                    <button 
                        className="queue-control-button"
                        onClick={() => runInBackground(handleNext(), 'Playing the next track')}
                        disabled={totalTracks === 0}
                        aria-label="Next track"
                    >
                        <SkipForward className="queue-control-icon" />
                    </button>
                </div>

                <div className="queue-mode-controls">
                    <button 
                        className={`queue-control-button ${queueState.shuffle ? 'active' : ''}`}
                        onClick={handleShuffle}
                        aria-label="Toggle shuffle"
                    >
                        <Shuffle className="queue-control-icon" />
                    </button>
                    
                    <button 
                        className="queue-control-button"
                        onClick={handleRepeat}
                        aria-label={`Repeat mode: ${queueState.repeatMode}`}
                    >
                        {getRepeatIcon()}
                    </button>
                    
                    <button 
                        className="queue-control-button"
                        onClick={handleClearQueue}
                        disabled={totalTracks === 0}
                        aria-label="Clear queue"
                    >
                        <Trash2 className="queue-control-icon" />
                    </button>
                </div>
            </div>

            <div className="queue-list">
                {/* Next in Queue section */}
                {queueState.nextInQueue.length > 0 && (
                    <div className="queue-subsection">
                        <div className="queue-subsection-header">Next in Queue</div>
                        {queueState.nextInQueue.map((track, index) => (
                            <div 
                                key={`next-${track.id}-${index}`} 
                                className={`queue-item next-in-queue ${draggedType === 'nextInQueue' && draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index && draggedType === 'nextInQueue' ? 'drag-over' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index, 'nextInQueue')}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index, 'nextInQueue')}
                                onDragEnd={handleDragEnd}
                            >
                                <GripVertical className="queue-item-handle" />
                                <div className="queue-item-info">
                                    <div className="queue-item-name">{track.name}</div>
                                    {track.duration && (
                                        <div className="queue-item-duration">
                                            {formatTime(track.duration)}
                                        </div>
                                    )}
                                </div>
                                <button
                                    className="queue-item-remove"
                                    onClick={() => handleRemoveFromNextInQueue(index)}
                                    aria-label="Remove from queue"
                                >
                                    <X className="queue-item-remove-icon" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Main Queue */}
                {queueState.tracks.length > 0 && (
                    <div className="queue-subsection">
                        {queueState.tracks.map((track, index) => {
                            const isCurrentTrack = index === queueState.currentIndex && 
                                                 queueState.nextInQueue.length === 0;
                            return (
                                <div 
                                    key={`queue-${track.id}-${index}`} 
                                    className={`queue-item ${isCurrentTrack ? 'current' : ''} ${draggedType === 'queue' && draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index && draggedType === 'queue' ? 'drag-over' : ''}`}
                                    onDoubleClick={() => runInBackground(handleJumpToTrack(index), 'Jumping to a queued track')}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index, 'queue')}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, index, 'queue')}
                                    onDragEnd={handleDragEnd}
                                >
                                    <GripVertical className="queue-item-handle" />
                                    <div className="queue-item-number">
                                        {isCurrentTrack && isPlaying ? (
                                            <div className="playing-indicator">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                        ) : (
                                            index + 1
                                        )}
                                    </div>
                                    <div className="queue-item-info">
                                        <div className="queue-item-name">{track.name}</div>
                                        {track.duration && (
                                            <div className="queue-item-duration">
                                                {formatTime(track.duration)}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className="queue-item-remove"
                                        onClick={() => handleRemoveTrack(index)}
                                        aria-label="Remove from queue"
                                    >
                                        <X className="queue-item-remove-icon" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
