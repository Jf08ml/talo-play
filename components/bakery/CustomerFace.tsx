import type { Customer } from "@/lib/bakery";

/** A customer: a round little creature with its own color and accessory. */
export default function CustomerFace({ customer, mood = "normal", className = "h-16 w-16" }: { customer: Customer; mood?: "normal" | "happy" | "sad"; className?: string }) {
  const { body, accent, accessory } = customer;
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label={customer.name}>
      {accessory === "antenas" && (
        <g stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M30 20 Q24 8 18 6" />
          <path d="M50 20 Q56 8 62 6" />
          <circle cx="18" cy="6" r="4" fill={accent} stroke="none" />
          <circle cx="62" cy="6" r="4" fill={accent} stroke="none" />
        </g>
      )}
      <ellipse cx="40" cy="46" rx="30" ry="28" fill={body} />
      <ellipse cx="32" cy="34" rx="10" ry="6" fill="#ffffff55" />
      {/* Eyes */}
      {mood === "happy" ? (
        <g stroke="#1f2937" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M26 44 q4 -5 8 0" />
          <path d="M46 44 q4 -5 8 0" />
        </g>
      ) : (
        <g fill="#1f2937">
          <circle cx="30" cy="44" r="4.5" />
          <circle cx="50" cy="44" r="4.5" />
          <circle cx="31.5" cy="42.5" r="1.4" fill="#fff" />
          <circle cx="51.5" cy="42.5" r="1.4" fill="#fff" />
        </g>
      )}
      <circle cx="22" cy="53" r="4" fill="#fb7185" opacity="0.45" />
      <circle cx="58" cy="53" r="4" fill="#fb7185" opacity="0.45" />
      {mood === "sad" ? (
        <path d="M33 60 q7 -6 14 0" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M33 56 q7 7 14 0" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" fill={mood === "happy" ? "#be123c" : "none"} />
      )}
      {accessory === "anteojos" && (
        <g stroke={accent} strokeWidth="2.5" fill="none">
          <circle cx="30" cy="44" r="8" />
          <circle cx="50" cy="44" r="8" />
          <path d="M38 44 h4" />
        </g>
      )}
      {accessory === "moño" && (
        <g fill={accent}>
          <path d="M40 20 L26 12 L28 28 Z" />
          <path d="M40 20 L54 12 L52 28 Z" />
          <circle cx="40" cy="20" r="4" />
        </g>
      )}
      {accessory === "gorro" && (
        <g>
          <ellipse cx="40" cy="22" rx="22" ry="6" fill="#fff" />
          <path d="M24 22 Q22 4 34 6 Q40 -2 46 6 Q58 4 56 22 Z" fill="#fff" stroke="#e5e7eb" />
          <rect x="22" y="18" width="36" height="6" rx="3" fill={accent} />
        </g>
      )}
      {accessory === "corona" && <path d="M26 22 L28 8 L34 16 L40 6 L46 16 L52 8 L54 22 Z" fill="#facc15" stroke={accent} strokeWidth="1.5" />}
      {accessory === "flor" && (
        <g transform="translate(58 20)">
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 5} cy={Math.sin((a * Math.PI) / 180) * 5} r="4.5" fill={accent} />
          ))}
          <circle r="3.5" fill="#fde047" />
        </g>
      )}
    </svg>
  );
}
