import { SUIT_INFO, isJoker, rankOf, suitOf, type Suit } from "@/lib/baraja";

/** The four Spanish suits as small drawings (game art, colored per suit). */
export function SuitIcon({ suit, className = "h-6 w-6" }: { suit: Suit; className?: string }) {
  const color = SUIT_INFO[suit].color;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {suit === "o" && (
        <g>
          <circle cx="12" cy="12" r="10" fill={color} />
          <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fef08a" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.2" fill="#fef08a" />
        </g>
      )}
      {suit === "c" && (
        <g fill={color}>
          <path d="M5 3h14c0 5-2.6 8.2-5.5 9v4.5H17V20H7v-3.5h3.5V12C7.6 11.2 5 8 5 3z" />
          <path d="M7 5h10c-.4 2.6-1.8 4.5-5 4.5S7.4 7.6 7 5z" fill="#fecaca" opacity="0.5" />
        </g>
      )}
      {suit === "e" && (
        <g fill={color}>
          <path d="M12 1.5l2 3v11.5h-4V4.5z" />
          <rect x="6.5" y="16" width="11" height="2.2" rx="1" />
          <rect x="10.8" y="18" width="2.4" height="3.5" rx="0.6" />
          <circle cx="12" cy="22.2" r="1.3" />
        </g>
      )}
      {suit === "b" && (
        <g fill={color}>
          <path d="M9 22l1.6-15.5C9 5.8 8.6 3.6 10 2.4c1.6-1.4 4.6-.6 4.9 1.7.2 1.6-.6 2.6-1.6 3L14.8 22z" />
          <circle cx="11" cy="9.5" r="1.1" fill="#bbf7d0" />
          <circle cx="13.2" cy="13.5" r="1.1" fill="#bbf7d0" />
        </g>
      )}
    </svg>
  );
}

const SIZES = {
  sm: { box: "h-16 w-11 rounded-md", rank: "text-xs", icon: "h-5 w-5" },
  md: { box: "h-24 w-16 rounded-lg", rank: "text-sm", icon: "h-8 w-8" },
  lg: { box: "h-32 w-[5.5rem] rounded-xl", rank: "text-base", icon: "h-11 w-11" },
};

/** A Spanish playing card, face up or down. */
export default function Naipe({
  code,
  size = "md",
  faceDown = false,
  selected = false,
  dim = false,
  onClick,
  className = "",
}: {
  code?: string;
  size?: keyof typeof SIZES;
  faceDown?: boolean;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const s = SIZES[size];
  const base = `relative flex shrink-0 select-none flex-col items-center justify-center border shadow-md transition ${s.box} ${
    selected ? "-translate-y-3 ring-4 ring-cyan-400" : ""
  } ${dim ? "opacity-40" : ""} ${onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${className}`;

  if (faceDown || !code) {
    return (
      <button type="button" onClick={onClick} disabled={!onClick} className={`${base} border-indigo-300 bg-indigo-700`}>
        <span className="absolute inset-1 rounded-[inherit] border-2 border-indigo-300/50 bg-[repeating-linear-gradient(45deg,#4338ca_0_6px,#3730a3_6px_12px)]" />
      </button>
    );
  }

  if (isJoker(code)) {
    return (
      <button type="button" onClick={onClick} disabled={!onClick} className={`${base} border-fuchsia-300 bg-gradient-to-br from-fuchsia-100 to-amber-100`}>
        <span className={`${s.icon} flex items-center justify-center text-2xl`}>🃏</span>
        <span className="text-[10px] font-bold uppercase text-fuchsia-700">Comodín</span>
      </button>
    );
  }

  const suit = suitOf(code);
  const rank = rankOf(code);
  const color = SUIT_INFO[suit].color;
  const figure = rank === 10 ? "Sota" : rank === 11 ? "Caballo" : rank === 12 ? "Rey" : "";
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`${base} border-stone-300 bg-[#fffbeb]`}>
      <span className={`absolute left-1 top-0.5 font-bold ${s.rank}`} style={{ color }}>
        {rank}
      </span>
      <span className={`absolute bottom-0.5 right-1 rotate-180 font-bold ${s.rank}`} style={{ color }}>
        {rank}
      </span>
      <SuitIcon suit={suit} className={s.icon} />
      {figure && size !== "sm" && (
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color }}>
          {figure}
        </span>
      )}
    </button>
  );
}
