import { getTrack, type TrackId } from "@/lib/carrerasTrack";

/** The track's outline, for picking one in the lobby and the waiting room; `seed` shapes `aleatoria`. */
export default function TrackPreview({ track, seed = 0, className = "" }: { track: TrackId; seed?: number; className?: string }) {
  const t = getTrack(track, seed);
  const d = Array.from(t.xs, (x, i) => `${i ? "L" : "M"}${x.toFixed(0)} ${t.ys[i].toFixed(0)}`).join(" ") + "Z";
  return (
    <svg viewBox={`0 0 ${t.worldW} ${t.worldH}`} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke="#475569" strokeWidth={t.def.width * Math.max(1, t.worldW / 1900)} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={8} strokeDasharray="30 30" strokeLinejoin="round" opacity={0.5} />
      <circle cx={t.xs[0]} cy={t.ys[0]} r={34 * (t.worldW / 1600)} fill="#f8fafc" />
    </svg>
  );
}
