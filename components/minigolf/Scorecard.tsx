import { toPar } from "@/lib/minigolfSim";

export interface ScoreRow {
  id: string;
  name: string;
  color: string;
  /** Strokes per hole played so far. */
  card: number[];
}

/**
 * The scorecard: one column per hole (par on top), one row per player with
 * the total and how it stands against par. Rows come sorted by the caller.
 */
export default function Scorecard({ pars, rows, myId, current }: { pars: number[]; rows: ScoreRow[]; myId?: string; current?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white/[0.04] ring-1 ring-white/10">
      <table className="w-full text-center text-sm text-white">
        <thead className="text-[11px] text-white/50">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Hoyo</th>
            {pars.map((_, i) => (
              <th key={i} className={`px-1.5 py-1.5 font-semibold ${i === current ? "text-talo-hero" : ""}`}>
                {i + 1}
              </th>
            ))}
            <th className="px-2 py-1.5 font-semibold">Total</th>
          </tr>
          <tr className="border-t border-white/10">
            <th className="px-2 py-1 text-left font-semibold">Par</th>
            {pars.map((p, i) => (
              <th key={i} className="px-1.5 py-1 font-mono font-normal">
                {p}
              </th>
            ))}
            <th className="px-2 py-1 font-mono font-normal">{pars.reduce((a, b) => a + b, 0)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.card.reduce((a, b) => a + b, 0);
            const parSoFar = pars.slice(0, r.card.length).reduce((a, b) => a + b, 0);
            return (
              <tr key={r.id} className="border-t border-white/10">
                <td className="max-w-[7rem] px-2 py-1.5 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className="truncate font-bold">{r.id === myId ? "Vos" : r.name}</span>
                  </span>
                </td>
                {pars.map((p, i) => {
                  const s = r.card[i];
                  const tone = s === undefined ? "" : s < p ? "text-[#5fe0a0]" : s > p ? "text-[#ff8a80]" : "";
                  return (
                    <td key={i} className={`px-1.5 py-1.5 font-mono ${tone}`}>
                      {s ?? "·"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 font-mono font-bold">
                  {r.card.length ? (
                    <>
                      {total} <span className="text-xs font-normal text-white/50">{toPar(total, parSoFar)}</span>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
