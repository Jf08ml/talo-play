"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Crown, Trophy } from "lucide-react";
import { getRanking, weekKey, type RankRow } from "@/lib/rank";
import { isFirebaseConfigured } from "@/lib/firebase";

/** The home's peek at the week's ranking (top 5), linking to /ranking. Hidden while nobody has points. */
export default function RankingTeaser({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<RankRow[]>([]);
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    getRanking(weekKey(), 5).then(setRows).catch(console.error);
  }, []);
  if (!rows.length) return null;
  return (
    <Link href="/ranking" className={`group flex flex-col gap-4 rounded-[24px] border-2 border-talo-ink bg-white p-5 transition hover:-translate-y-0.5 sm:p-6 ${className}`}>
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6" />
        <p className="flex-1 font-display text-[22px] leading-tight sm:text-[26px]">Ranking de la semana</p>
        <span className="flex items-center gap-1 text-[15px] font-bold">
          Ver todo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2 rounded-xl bg-talo-surface px-3 py-2">
            <span className="w-5 text-center font-display">{i === 0 ? <Crown className="h-5 w-5 fill-talo-hero" /> : i + 1}</span>
            <span className="h-5 w-5 shrink-0 rounded-md" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{r.name}</span>
            <span className="font-mono text-[14px] font-bold">{r.p}</span>
          </li>
        ))}
      </ol>
    </Link>
  );
}
