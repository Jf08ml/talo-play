// Talo's mark: two overlapping circles (people coming together) next to the
// wordmark. Flat colors; the overlap is the darker lens where they meet.
// Inline SVG + text, so it costs no asset requests.

export function TaloMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <clipPath id="talo-left">
          <circle cx="15" cy="20" r="11" />
        </clipPath>
      </defs>
      <circle cx="15" cy="20" r="11" fill="#8b5cf6" />
      <circle cx="25" cy="20" r="11" fill="#f4f1ff" />
      <circle cx="25" cy="20" r="11" fill="#5b21b6" clipPath="url(#talo-left)" />
    </svg>
  );
}

export default function TaloLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const styles = {
    sm: { mark: "h-6 w-6", text: "text-xl" },
    md: { mark: "h-8 w-8", text: "text-2xl" },
    lg: { mark: "h-12 w-12 sm:h-14 sm:w-14", text: "text-5xl sm:text-6xl" },
  }[size];
  return (
    <span className="inline-flex items-center gap-1.5">
      <TaloMark className={styles.mark} />
      <span className={`font-display font-bold tracking-[-0.04em] text-white ${styles.text} leading-none`}>talo</span>
    </span>
  );
}
