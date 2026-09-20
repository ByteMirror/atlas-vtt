import React from 'react';
import './map-loading-overlay.scss';

interface MapLoadingOverlayProps {
    isLoading: boolean;
    progress?: number;
    message?: string;
}

export const MapLoadingOverlay: React.FC<MapLoadingOverlayProps> = ({ 
    isLoading, 
    progress,
    message = "Loading map..." 
}) => {
    if (!isLoading) return null;
    
    return (
        <div className="atlas-map-loading-overlay">
            <div className="atlas-map-loading-content">
                <div className="atlas-map-loading-spinner">
                    <div className="atlas-map-loading-spinner-ring"></div>
                    <div className="atlas-map-loading-spinner-ring"></div>
                    <div className="atlas-map-loading-spinner-ring"></div>
                </div>
                <div className="atlas-map-loading-text">{message}</div>
                {progress !== undefined && (
                    <div className="atlas-map-loading-progress">
                        <div 
                            className="atlas-map-loading-progress-bar" 
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};