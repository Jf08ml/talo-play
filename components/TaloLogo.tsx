// Talo's mark: two overlapping circles (people coming together) next to the
// wordmark. Inline SVG + text, so it costs no asset requests.

export function TaloMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="talo-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <linearGradient id="talo-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="20" r="11" fill="url(#talo-a)" />
      <circle cx="25" cy="20" r="11" fill="url(#talo-b)" fillOpacity="0.85" style={{ mixBlendMode: "screen" }} />
    </svg>
  );
}

export default function TaloLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const styles = {
    sm: { mark: "h-6 w-6", text: "text-xl" },
    md: { mark: "h-9 w-9", text: "text-3xl" },
    lg: { mark: "h-14 w-14 sm:h-16 sm:w-16", text: "text-5xl sm:text-6xl" },
  }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <TaloMark className={styles.mark} />
      <span
        className={`font-display font-extrabold tracking-tight ${styles.text} bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text leading-none text-transparent`}
      >
        talo
      </span>
    </span>
  );
}
