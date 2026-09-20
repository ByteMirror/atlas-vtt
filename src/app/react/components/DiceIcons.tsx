import React from 'react';

interface DiceIconProps {
  size?: number;
  className?: string;
}

export const D4Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L3 20h18L12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M12 2v18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const D6Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect 
      x="4" 
      y="4" 
      width="16" 
      height="16" 
      rx="2" 
      stroke="currentColor" 
      strokeWidth="2"
      fill="none"
    />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

export const D8Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L20 8v8l-8 6-8-6V8l8-6Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M12 2v20" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    <path d="M4 8l8 6 8-6" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const D10Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L18 6v4l-6 10-6-10V6l6-4Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M6 6l6 14 6-14" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const D12Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L19 7v10l-7 5-7-5V7l7-5Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <polygon 
      points="12,2 19,7 15,12 12,10 9,12 5,7" 
      stroke="currentColor" 
      strokeWidth="1" 
      opacity="0.5"
      fill="none"
    />
  </svg>
);

export const D20Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L21 8.5L17 19H7L3 8.5L12 2Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <path d="M12 2v17" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    <path d="M3 8.5L12 19L21 8.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
);

export const D100Icon: React.FC<DiceIconProps> = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M12 2L18 6v4l-6 10-6-10V6l6-4Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round"
      fill="none"
    />
    <text 
      x="12" 
      y="13" 
      textAnchor="middle" 
      fontSize="6" 
      fill="currentColor" 
      fontWeight="bold"
    >
      %
    </text>
  </svg>
);

export const diceIcons = {
  d4: D4Icon,
  d6: D6Icon,
  d8: D8Icon,
  d10: D10Icon,
  d12: D12Icon,
  d20: D20Icon,
  d100: D100Icon,
};

export type DiceType = keyof typeof diceIcons;