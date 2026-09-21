import React, { useState, useEffect } from 'react';
import type { App } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

interface StandaloneMusicPlayerProps {
    app: App;
    onClose: () => void;
}

export const StandaloneMusicPlayer: React.FC<StandaloneMusicPlayerProps> = ({
    app,
    onClose
}) => {
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        // Handle ESC key to close
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleClose = () => {
        setIsOpen(false);
        window.setTimeout(onClose, 200); // Allow animation to complete
    };

    if (!isOpen) return null;

    return (
        <div className="atlas-standalone-music-overlay" onClick={handleClose}>
            <div 
                className="atlas-standalone-music-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="atlas-standalone-music-header">
                    <h2>Atlas VTT Music & Ambience Player</h2>
                    <CloseButton onClick={handleClose} title="Close Music Player" />
                </div>
                
                <div className="atlas-standalone-music-content">
                    <MusicPlayer
                        app={app}
                        collectionPath="atlas-vtt/collections/default"
                    />
                </div>
            </div>
        </div>
    );
};