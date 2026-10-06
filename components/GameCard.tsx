"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface GameCardProps {
  href: string;
  title: string;
  description: string;
  thumbnail: ReactNode;
  badge?: string;
  disabled?: boolean;
}

export default function GameCard({
  href,
  title,
  description,
  thumbnail,
  badge,
  disabled,
}: GameCardProps) {
  const content = (
    <>
      <div className="h-40 w-full overflow-hidden">{thumbnail}</div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-slate-100">{title}</h2>
          {badge && (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </>
  );

  const className =
    "flex flex-col overflow-hidden rounded-2xl border border-violet-500/15 bg-slate-900/60 shadow-[0_0_25px_rgba(139,92,246,0.08)] backdrop-blur transition";

  if (disabled) {
    return <div className={`${className} cursor-not-allowed opacity-50`}>{content}</div>;
  }

  return (
    <Link
      href={href}
      className={`${className} hover:border-violet-400/40 hover:shadow-[0_0_35px_rgba(139,92,246,0.2)]`}
    >
      {content}
    </Link>
  );
}
