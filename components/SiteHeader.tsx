import Link from "next/link";
import type { ReactNode } from "react";
import TaloLogo from "./TaloLogo";

/** The top bar of Talo's own pages (home, lobbies): the logo home and `right`. */
export default function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#0b0c10]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Talo, inicio" className="transition hover:opacity-80">
          <TaloLogo size="sm" />
        </Link>
        {right}
      </div>
    </header>
  );
}
