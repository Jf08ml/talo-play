// Small inline SVG "cover art" pieces for the games hub — no external image
// assets, drawn in the same violet/cyan/fuchsia neon palette as the rest of
// the app so a game's card reads as part of the same family before you ever
// open it.

export function PuzzleThumbnail() {
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="puzzle-bg" cx="30%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#2e1065" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <filter id="puzzle-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#puzzle-bg)" />

      <g filter="url(#puzzle-glow)" opacity="0.95">
        <g transform="translate(150 60) rotate(-8)">
          <rect width="90" height="90" rx="14" fill="#a855f7" />
          <circle cx="90" cy="45" r="16" fill="#a855f7" />
        </g>
        <g transform="translate(230 90) rotate(6)">
          <rect width="90" height="90" rx="14" fill="#22d3ee" />
          <circle cx="0" cy="45" r="16" fill="#0b0a14" />
        </g>
        <g transform="translate(170 145) rotate(-4)">
          <rect width="90" height="90" rx="14" fill="#e879f9" />
          <circle cx="45" cy="0" r="16" fill="#0b0a14" />
        </g>
      </g>
    </svg>
  );
}

export function ComingSoonThumbnail() {
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="soon-bg" cx="50%" cy="50%" r="80%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#soon-bg)" />
      <text
        x="200"
        y="140"
        textAnchor="middle"
        fontSize="64"
        fill="#334155"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
      >
        ?
      </text>
    </svg>
  );
}
