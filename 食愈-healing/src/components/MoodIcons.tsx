import React from 'react';
import { Mood } from '../types';

interface MoodIconProps {
  mood: Mood;
  size?: number;
  className?: string;
}

const DoodleBlob = ({ color, size, children, className }: { color: string; size: number; children: React.ReactNode; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 100 100" 
    className={className}
    style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.05))' }}
  >
    {/* Irregular wobbly circle - more organic shape */}
    <path 
      d="M85,50 C85,75 75,85 50,85 C25,85 15,75 15,50 C15,25 25,15 50,15 C75,15 85,25 85,50 Z" 
      fill={color}
      transform="rotate(-2 50 50)"
    />
    {/* Subtle wobbly variation for hand-drawn look */}
    <path 
      d="M82,48 C82,72 72,82 48,82 C24,82 18,72 18,48 C18,24 24,18 48,18 C72,18 82,24 82,48 Z" 
      fill={color}
      opacity="0.3"
    />
    {children}
  </svg>
);

export const MoodIcon: React.FC<MoodIconProps> = ({ mood, size = 40, className }) => {
  switch (mood) {
    case 'happy':
      return (
        <DoodleBlob color="#FFB347" size={size} className={className}>
          <circle cx="35" cy="45" r="3" fill="#4E342E" />
          <circle cx="65" cy="45" r="3" fill="#4E342E" />
          <path d="M40,65 Q50,75 60,65" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
        </DoodleBlob>
      );
    case 'sad':
      return (
        <DoodleBlob color="#A8D8EA" size={size} className={className}>
          <circle cx="35" cy="50" r="3" fill="#4E342E" />
          <circle cx="65" cy="50" r="3" fill="#4E342E" />
          <path d="M40,70 Q50,60 60,70" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
        </DoodleBlob>
      );
    case 'tired':
      return (
        <DoodleBlob color="#F5E6D3" size={size} className={className}>
          <path d="M30,50 Q35,45 40,50" stroke="#4E342E" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M60,50 Q65,45 70,50" stroke="#4E342E" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="50" cy="70" r="4" fill="#4E342E" />
        </DoodleBlob>
      );
    case 'stressed':
      return (
        <DoodleBlob color="#D4A5A5" size={size} className={className}>
          <path d="M30,40 L40,50" stroke="#4E342E" strokeWidth="4" strokeLinecap="round" />
          <path d="M70,40 L60,50" stroke="#4E342E" strokeWidth="4" strokeLinecap="round" />
          <path d="M40,75 L60,65" stroke="#4E342E" strokeWidth="4" strokeLinecap="round" />
        </DoodleBlob>
      );
    case 'anxious':
      return (
        <DoodleBlob color="#C1CFA1" size={size} className={className}>
          <circle cx="35" cy="50" r="3" fill="#4E342E" />
          <circle cx="65" cy="50" r="3" fill="#4E342E" />
          <path d="M40,70 Q50,65 60,70" stroke="#4E342E" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M30,40 Q35,35 40,40" stroke="#4E342E" strokeWidth="2" fill="none" />
          <path d="M60,40 Q65,35 70,40" stroke="#4E342E" strokeWidth="2" fill="none" />
        </DoodleBlob>
      );
    case 'lonely':
      return (
        <DoodleBlob color="#BCAAA4" size={size} className={className}>
          <circle cx="35" cy="50" r="3" fill="#4E342E" />
          <circle cx="65" cy="50" r="3" fill="#4E342E" />
          <path d="M40,70 L60,70" stroke="#4E342E" strokeWidth="3" strokeLinecap="round" />
          <path d="M75,35 L75,50 M80,35 L80,50" stroke="#4E342E" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </DoodleBlob>
      );
    case 'neutral':
    default:
      return (
        <DoodleBlob color="#FFF8E7" size={size} className={className}>
          <circle cx="35" cy="50" r="3" fill="#4E342E" />
          <circle cx="65" cy="50" r="3" fill="#4E342E" />
          <path d="M45,70 L55,70" stroke="#4E342E" strokeWidth="3" strokeLinecap="round" />
        </DoodleBlob>
      );
  }
};
