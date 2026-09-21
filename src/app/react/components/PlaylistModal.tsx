import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

interface PlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    title: string;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title
}) => {
    const [playlistName, setPlaylistName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (playlistName.trim()) {
            onConfirm(playlistName.trim());
            setPlaylistName('');
            onClose();
        }
    };

    const handleClose = () => {
        setPlaylistName('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="atlas-playlist-modal-overlay" onClick={handleClose}>
            <div className="atlas-playlist-modal" onClick={(e) => e.stopPropagation()}>
                <div className="atlas-playlist-modal-header">
                    <h3>{title}</h3>
                    <CloseButton onClick={handleClose} />
                </div>
                <form onSubmit={handleSubmit} className="atlas-playlist-modal-form">
                    <input
                        type="text"
                        placeholder="Enter playlist name..."
                        value={playlistName}
                        onChange={(e) => setPlaylistName(e.target.value)}
                        className="atlas-playlist-modal-input"
                        autoFocus
                    />
                    <div className="atlas-playlist-modal-actions">
                        <LabelTooltip label="Cancel">
                            <button
                                type="button"
                                className="atlas-playlist-modal-button atlas-cancel"
                                onClick={handleClose}
                            >
                                <X size={20} />
                            </button>
                        </LabelTooltip>
                        <LabelTooltip label="Create Playlist">
                            <button
                                type="submit"
                                className="atlas-playlist-modal-button atlas-confirm"
                                disabled={!playlistName.trim()}
                            >
                                <Check size={20} />
                            </button>
                        </LabelTooltip>
                    </div>
                </form>
            </div>
        </div>
    );
};