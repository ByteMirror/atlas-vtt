import React from 'react';
import { MAP_LOADING_OVERLAY_FADE_MS, MAP_LOADING_REVEAL_DELAY_MS } from '../../pixi/mapLoadingFrameHold';
import { cn } from '../../../utils/cn';
import './map-loading-overlay.scss';

/** Timing shared with the canvas frame hold, which hands over to the overlay once it is opaque. */
const TIMING_STYLE = {
    '--atlas-map-loading-reveal-delay': `${MAP_LOADING_REVEAL_DELAY_MS}ms`,
    '--atlas-map-loading-fade': `${MAP_LOADING_OVERLAY_FADE_MS}ms`,
} as React.CSSProperties;

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
    // Stays mounted so it can fade out; it blocks input from the start of a load but only fades in after the reveal delay
    return (
        <div
            className={cn('atlas-map-loading-overlay', isLoading && 'atlas-map-loading-overlay--active')}
            style={TIMING_STYLE}
            aria-hidden={!isLoading}
        >
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