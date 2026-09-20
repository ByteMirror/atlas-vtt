import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Repeat, X, Headphones, MoreHorizontal } from 'lucide-react';
import { AudioTrack } from '../../services/AudioService';
import { Slider } from '../../packages/components/primitives/slider';
import { DropdownMenu } from '../../packages/components/primitives/DropdownMenu';

interface TrackCardProps {
    track: AudioTrack;
    channel: 'music' | 'ambience';
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    onPlay: () => void;
    onPause: () => void;
    onVolumeChange: (volume: number) => void;
    onMuteToggle: () => void;
    onSoloToggle: () => void;
    onLoopToggle: () => void;
    onSeek: (time: number) => void;
    onRemove: () => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({
    track,
    channel,
    isPlaying,
    currentTime,
    duration,
    onPlay,
    onPause,
    onVolumeChange,
    onMuteToggle,
    onSoloToggle,
    onLoopToggle,
    onSeek,
    onRemove
}) => {
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleProgressClick = useCallback((e: React.MouseEvent) => {
        if (!progressRef.current || !duration) return;
        
        const rect = progressRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * duration;
        
        onSeek(Math.max(0, Math.min(duration, newTime)));
    }, [duration, onSeek]);

    const handleProgressDrag = useCallback((e: MouseEvent) => {
        if (!isDraggingProgress || !progressRef.current || !duration) return;
        
        const rect = progressRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * duration;
        
        onSeek(Math.max(0, Math.min(duration, newTime)));
    }, [isDraggingProgress, duration, onSeek]);

    useEffect(() => {
        if (isDraggingProgress) {
            const handleMouseMove = (e: MouseEvent) => handleProgressDrag(e);
            const handleMouseUp = () => setIsDraggingProgress(false);
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDraggingProgress, handleProgressDrag]);

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className={`atlas-track-card ${channel} ${isPlaying ? 'playing' : ''} ${track.solo ? 'solo' : ''}`}>
            <div className="atlas-track-header">
                <button
                    className="atlas-track-play-button"
                    onClick={isPlaying ? onPause : onPlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                
                <div className="atlas-track-info">
                    <div className="atlas-track-title">{track.title}</div>
                    <div className="atlas-track-info-bottom">
                        <div className="atlas-track-time">
                            {formatTime(currentTime)} / {formatTime(duration || 0)}
                        </div>
                        <div className="atlas-track-volume-slider">
                            <Slider
                                value={[track.volume * 100]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={(value: number[]) => {
                                    const volume = (value[0] ?? track.volume * 100) / 100;
                                    onVolumeChange(volume);
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className="atlas-track-controls">
                    {/* Regular controls for larger screens */}
                    <div className="atlas-track-controls-full">
                        <button
                            className={`atlas-track-control-button ${track.loop ? 'active' : ''}`}
                            onClick={onLoopToggle}
                            aria-label="Toggle loop"
                        >
                            <Repeat size={18} />
                        </button>

                        <button
                            className="atlas-track-control-button"
                            onClick={onMuteToggle}
                            aria-label={track.muted ? 'Unmute' : 'Mute'}
                        >
                            {track.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        <button
                            className={`atlas-track-control-button ${track.solo ? 'active' : ''}`}
                            onClick={onSoloToggle}
                            aria-label="Solo"
                        >
                            <Headphones size={18} />
                        </button>

                        <button
                            className="atlas-track-control-button"
                            onClick={onRemove}
                            aria-label="Remove track"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Compact controls with overflow menu for small screens */}
                    <div className="atlas-track-controls-compact">
                        <button
                            className="atlas-track-control-button"
                            onClick={onMuteToggle}
                            aria-label={track.muted ? 'Unmute' : 'Mute'}
                        >
                            {track.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        <DropdownMenu
                            isOpen={isOverflowMenuOpen}
                            onToggle={() => setIsOverflowMenuOpen(!isOverflowMenuOpen)}
                            position="bottom"
                            align="right"
                            label="More options"
                            triggerRef={overflowButtonRef}
                            triggerButton={
                                <button
                                    ref={overflowButtonRef}
                                    className="atlas-track-control-button"
                                    aria-label="More options"
                                >
                                    <MoreHorizontal size={18} />
                                </button>
                            }
                            menuClassName="atlas-track-overflow-menu"
                        >
                            <button
                                className="atlas-overflow-menu-item"
                                onClick={() => {
                                    onLoopToggle();
                                    setIsOverflowMenuOpen(false);
                                }}
                            >
                                <Repeat size={16} className={track.loop ? 'active' : ''} />
                                <span>Loop</span>
                            </button>
                            <button
                                className="atlas-overflow-menu-item"
                                onClick={() => {
                                    onSoloToggle();
                                    setIsOverflowMenuOpen(false);
                                }}
                            >
                                <Headphones size={16} className={track.solo ? 'active' : ''} />
                                <span>Solo</span>
                            </button>
                            <div className="atlas-overflow-menu-divider" />
                            <button
                                className="atlas-overflow-menu-item atlas-danger"
                                onClick={() => {
                                    onRemove();
                                    setIsOverflowMenuOpen(false);
                                }}
                            >
                                <X size={16} />
                                <span>Remove</span>
                            </button>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            <div 
                className="atlas-track-progress"
                ref={progressRef}
                onClick={handleProgressClick}
                onMouseDown={() => setIsDraggingProgress(true)}
            >
                <div className="atlas-track-progress-bar">
                    <div 
                        className="atlas-track-progress-fill"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            </div>
        </div>
    );
};