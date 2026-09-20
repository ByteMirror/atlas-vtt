import React, { useState, useMemo } from 'react';
import { 
    Search, Music, Wind, CloudRain, Droplets, Flame, Trees, Volume2, 
    Waves, Snowflake, Sun, Moon, Star, Zap, Heart, Home, Mountain, 
    Bird, Fish, Tent, Sparkles, Leaf, Eye, Hand, Book, 
    Shield, Sword, Skull, Gem, FlaskConical, Headphones, Mic, 
    CloudSnow, CloudLightning, Sunrise, Sunset, Gamepad2,
    Bug, Cat, Dog, Rabbit, Flower, Flower2,
    Anchor, Sailboat, Ship, Plane, Car, Bike, Train, Truck,
  X,
} from 'lucide-react';
import './ambient-icon-selector.scss';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

interface AmbientIconSelectorProps {
    value: string;
    onChange: (iconName: string) => void;
    onClose?: () => void;
}

// Create a safe icon map with known working icons
const iconMap = {
    // Nature & Weather
    Wind, CloudRain, Droplets, Flame, Trees, Waves, Snowflake, Sun, Moon, Star, 
    Sparkles, Leaf, CloudSnow, CloudLightning, Sunrise, Sunset,
    Flower, Flower2,
    
    // Audio & Music
    Music, Volume2, Headphones, Mic,
    
    // Actions & Objects
    Zap, Heart, Home, Mountain, Eye, Hand, Book, Shield, Sword, Skull, 
    Gem, FlaskConical, Tent, Gamepad2,
    
    // Animals
    Bird, Fish, Bug, Cat, Dog, Rabbit,
    
    // Transport
    Anchor, Sailboat, Ship, Plane, Car, Bike, Train, Truck,
    
    // UI
    Search, X
};

export const AmbientIconSelector: React.FC<AmbientIconSelectorProps> = ({
    value,
    onChange,
    onClose
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    
    // Get all available icon names
    const allIcons = useMemo(() => {
        return Object.keys(iconMap).sort();
    }, []);
    
    // Filter icons based on search
    const filteredIcons = useMemo(() => {
        if (!searchQuery) return allIcons;
        
        const query = searchQuery.toLowerCase();
        return allIcons.filter(iconName => 
            iconName.toLowerCase().includes(query)
        );
    }, [allIcons, searchQuery]);
    
    // Popular ambient sound icons
    const popularIcons = [
        'Wind', 'CloudRain', 'Droplets', 'Flame', 'Trees', 'Music',
        'Volume2', 'Waves', 'Snowflake', 'Sun', 'Moon', 'Star',
        'Zap', 'Heart', 'Home', 'Mountain', 'Bird', 'Fish',
        'Tent', 'Sparkles', 'Leaf'
    ];
    
    const renderIcon = (iconName: string, size: number = 20) => {
        const IconComponent = (iconMap as any)[iconName];
        return IconComponent ? <IconComponent size={size} /> : null;
    };
    
    return (
        <div className="atlas-ambient-icon-selector">
            <div className="atlas-icon-selector-header">
                <h3>Choose an Icon</h3>
                <CloseButton onClick={onClose} />
            </div>
            
            <div className="atlas-icon-selector-search">
                <Search size={16} />
                <input
                    type="text"
                    placeholder="Search icons..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                />
            </div>
            
            {!searchQuery && (
                <div className="atlas-icon-selector-section">
                    <h4>Popular Ambient Icons</h4>
                    <div className="atlas-icon-grid">
                        {popularIcons.map(iconName => (
                            <button
                                key={iconName}
                                className={`atlas-icon-option ${value === iconName ? 'selected' : ''}`}
                                onClick={() => onChange(iconName)}
                                title={iconName}
                            >
                                {renderIcon(iconName)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="atlas-icon-selector-section">
                <h4>{searchQuery ? 'Search Results' : 'All Icons'}</h4>
                <div className="atlas-icon-grid">
                    {filteredIcons.length > 0 ? (
                        filteredIcons.map(iconName => (
                            <button
                                key={iconName}
                                className={`atlas-icon-option ${value === iconName ? 'selected' : ''}`}
                                onClick={() => onChange(iconName)}
                                title={iconName}
                            >
                                {renderIcon(iconName)}
                            </button>
                        ))
                    ) : (
                        <p className="atlas-no-results">No icons found</p>
                    )}
                </div>
            </div>
        </div>
    );
};