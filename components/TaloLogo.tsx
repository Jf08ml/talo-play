// Talo's logo: "tal" in Dela Gothic One and, as the "o", a round talo with two
// eyes looking ahead (to the right). Inline SVG + text, no asset requests.
// `tone`: "ink" on Talo's light pages, "hero" (yellow) on the dark rooms.

type Tone = "ink" | "hero";

const BODY: Record<Tone, string> = { ink: "#111111", hero: "#FFD400" };

/** The talo-"o" alone: the app's mark (room headers, small corners). */
export function TaloMark({ className = "h-8 w-8", tone = "hero" }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill={BODY[tone]} />
      <circle cx="13.5" cy="19" r="6.4" fill="#FFFFFF" />
      <circle cx="26.5" cy="19" r="6.4" fill="#FFFFFF" />
      <circle cx="15.3" cy="19.8" r="3.1" fill="#111111" />
      <circle cx="28.3" cy="19.8" r="3.1" fill="#111111" />
    </svg>
  );
}

export default function TaloLogo({ size = "md", tone = "ink" }: { size?: "sm" | "md" | "lg"; tone?: Tone }) {
  const styles = {
    sm: { text: "text-[26px]", mark: "h-[0.8em] w-[0.8em]" },
    md: { text: "text-[38px]", mark: "h-[0.8em] w-[0.8em]" },
    lg: { text: "text-6xl", mark: "h-[0.8em] w-[0.8em]" },
  }[size];
  return (
    <span
      className={`inline-flex items-center font-display leading-none ${styles.text} ${tone === "ink" ? "text-talo-ink" : "text-white"}`}
    >
      tal
      <TaloMark tone={tone} className={`${styles.mark} ml-[0.05em] mt-[0.18em]`} />
    </span>
  );
}
