import React from "react";

export function AppleWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83z" />
      <path d="M12.02 5.5c.67-.82 1.13-1.96.99-3.1-.98.05-2.16.66-2.85 1.47-.61.71-1.15 1.86-.99 2.97 1.09.09 2.19-.53 2.85-1.34z" />
    </svg>
  );
}

export function ChatGptWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* OpenAI Rosette Wireframe */}
      <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
      <path d="M12 2a4 4 0 0 1 4 4v3" />
      <path d="M20.66 7a4 4 0 0 1-.54 5.63l-2.6 1.5" />
      <path d="M20.66 17a4 4 0 0 1-4.54 1.63l-2.6-1.5" />
      <path d="M12 22a4 4 0 0 1-4-4v-3" />
      <path d="M3.34 17a4 4 0 0 1 .54-5.63l2.6-1.5" />
      <path d="M3.34 7a4 4 0 0 1 4.54-1.63l2.6 1.5" />
    </svg>
  );
}

export function BinanceWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Center diamond */}
      <path d="M12 9l3 3-3 3-3-3z" />
      {/* Top chevron */}
      <path d="M9 5l3-3 3 3-1.5 1.5L12 5l-1.5 1.5z" />
      {/* Bottom chevron */}
      <path d="M9 19l3 3 3-3-1.5-1.5L12 19l-1.5-1.5z" />
      {/* Left chevron */}
      <path d="M5 9l-3 3 3 3 1.5-1.5L5 12l1.5-1.5z" />
      {/* Right chevron */}
      <path d="M19 9l3 3-3 3-1.5-1.5L19 12l-1.5-1.5z" />
    </svg>
  );
}

export function GiffgaffWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <rect x="8" y="10" width="8" height="7" rx="1" />
      <path d="M8 13.5h8" />
      <path d="M12 10v7" />
    </svg>
  );
}

export function OneNzWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9l2-2v10" />
      <path d="M9 17h6" />
    </svg>
  );
}

export function HahaSimWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.25" fill="currentColor" />
      <circle cx="15" cy="9" r="1.25" fill="currentColor" />
      <path d="M8 14c1 2 4 2 5 0" />
      <path d="M15 14c.5 1 1.5 1 2 0" />
    </svg>
  );
}

export function GoogleWireframeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2c2.73 0 5.21 1.09 7.02 2.87l-2.83 2.83A5.99 5.99 0 0 0 12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.8 0 5.16-1.92 5.82-4.5H12v-3.5h9.72c.18.64.28 1.31.28 2 0 5.523-4.477 10-10 10z" />
    </svg>
  );
}
