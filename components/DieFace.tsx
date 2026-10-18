const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

/**
 * A die showing `value` (0 = "?"). Changing `rollKey` replays the roll
 * animation; `glow` tints its shadow; `dim` marks a die already used.
 */
export default function DieFace({
  value,
  rollKey,
  glow,
  dim = false,
  className = "h-16 w-16 rounded-2xl",
}: {
  value: number;
  rollKey?: number | string;
  glow?: string;
  dim?: boolean;
  className?: string;
}) {
  return (
    <div
      key={rollKey}
      className={`animate-dice-roll relative bg-white shadow-lg transition-opacity ${dim ? "opacity-30" : ""} ${className}`}
      style={glow ? { boxShadow: `0 0 20px ${glow}88` } : undefined}
    >
      {value === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-2xl text-slate-400">?</span>
      ) : (
        PIPS[value]?.map(([x, y], i) => (
          <span
            key={i}
            className="absolute h-[19%] w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))
      )}
    </div>
  );
}
