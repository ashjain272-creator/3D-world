import type { SVGProps } from 'react';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icon = {
  Universe: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5" />
      <path d="M12 20.5c-4.7 0-8.5-3.8-8.5-8.5" />
      <path d="M16.5 7.2c-2.6-1.6-6.4-.9-8.6 1.7" />
      <path d="M7.5 16.8c2.6 1.6 6.4.9 8.6-1.7" />
    </svg>
  ),
  Explorer: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M3 19l5.5-9 4 6 2.5-3.5L21 19z" />
      <circle cx="17" cy="6" r="2" />
    </svg>
  ),
  Civs: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M4 20V10l4-3 4 3v10" />
      <path d="M12 20V6l4-3 4 3v14" />
      <path d="M2.5 20h19" />
      <path d="M7 13h2M7 16h2M15 9h2M15 12h2M15 15h2" />
    </svg>
  ),
  Characters: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.5 14.6c2.3.2 4 1.9 4.5 4.6" />
    </svg>
  ),
  History: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v3.5h3.5" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  ),
  Discoveries: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M9 3h6M10 3v6.5L5 19a1.3 1.3 0 0 0 1.2 2h11.6A1.3 1.3 0 0 0 19 19l-5-9.5V3" />
      <path d="M7.5 15h9" />
    </svg>
  ),
  Creator: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" />
      <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  ),
  Settings: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  ),
  Play: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 5v14l11-7z" />
    </svg>
  ),
  Pause: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  Close: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Arrow: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Back: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  ),
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  ),
  Eye: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Genesis">
      <defs>
        <radialGradient id="lg-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#9fe6ff" />
          <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="9" fill="url(#lg-core)" />
      <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#3d8bff" strokeWidth="1.1" transform="rotate(-25 16 16)" opacity="0.9" />
      <ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#6fd6ff" strokeWidth="0.8" transform="rotate(35 16 16)" opacity="0.5" />
    </svg>
  );
}
