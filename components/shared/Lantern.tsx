import React from 'react';

export const Lantern = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 120" className={className} fill="currentColor">
    <line x1="50" y1="0" x2="50" y2="15" stroke="currentColor" strokeWidth="2" />
    <path d="M50 15 C25 15 20 35 20 55 C20 75 25 95 50 95 C75 95 80 75 80 55 C80 35 75 15 50 15 Z" />
    <path d="M40 18 C32 30 32 80 40 92 M60 18 C68 30 68 80 60 92" stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" />
    <rect x="35" y="12" width="30" height="6" rx="2" fill="currentColor" filter="brightness(0.8)" />
    <rect x="35" y="92" width="30" height="6" rx="2" filter="brightness(0.8)" />
    <path d="M45 98 L42 115 M50 98 L50 120 M55 98 L58 115" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="50" cy="118" r="1.5" fill="currentColor" />
  </svg>
);
