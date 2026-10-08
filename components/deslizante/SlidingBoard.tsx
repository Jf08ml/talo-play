"use client";

/**
 * Renders a sliding-puzzle board. Each tile is positioned absolutely by where
 * it currently is, so moves animate with a CSS transition; its picture is the
 * slice of the image for where it belongs.
 */
export default function SlidingBoard({
  tiles,
  size,
  imageUrl,
  showNumbers,
  onTileClick,
  compact,
}: {
  tiles: number[];
  size: number;
  imageUrl: string;
  showNumbers: boolean;
  onTileClick?: (pos: number) => void;
  /** Small preview: thinner gaps, no numbers, no interaction. */
  compact?: boolean;
}) {
  const cell = 100 / size;
  const gapPx = compact ? 1 : 3;

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-950/80 ring-1 ring-violet-500/20">
      {tiles.map((tile, pos) => {
        if (tile === 0) return null;
        const home = tile - 1;
        const homeCol = home % size;
        const homeRow = Math.floor(home / size);
        const inPlace = pos === home;
        return (
          <button
            key={tile}
            type="button"
            tabIndex={-1}
            disabled={!onTileClick}
            onClick={() => onTileClick?.(pos)}
            aria-label={`Ficha ${tile}`}
            className={`absolute transition-[left,top] duration-150 ease-out ${onTileClick ? "cursor-pointer" : "cursor-default"}`}
            style={{
              left: `${(pos % size) * cell}%`,
              top: `${Math.floor(pos / size) * cell}%`,
              width: `${cell}%`,
              height: `${cell}%`,
              padding: gapPx / 2,
            }}
          >
            <span
              className={`relative block h-full w-full overflow-hidden ${compact ? "rounded-[2px]" : "rounded-md"}`}
              style={{
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: `${size * 100}%`,
                backgroundPosition: `${(homeCol * 100) / (size - 1)}% ${(homeRow * 100) / (size - 1)}%`,
                boxShadow: compact ? undefined : inPlace ? "0 0 0 2px rgba(52,211,153,0.55)" : "0 2px 6px rgba(0,0,0,0.5)",
              }}
            >
              {showNumbers && !compact && (
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1 font-mono text-[10px] font-semibold leading-tight text-white sm:text-xs">
                  {tile}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
