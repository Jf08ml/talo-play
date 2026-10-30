import Link from "next/link";
import type { ReactNode } from "react";
import TaloLogo from "./TaloLogo";

const NAV = [
  { href: "/#juegos", label: "Juegos" },
  { href: "/#como", label: "Cómo funciona" },
  { href: "/#faq", label: "Ayuda" },
];

/**
 * The top of Talo's light pages (home, lobbies). It sits inside each page's
 * colored hero, so it has no background of its own. `right` goes after the
 * nav (the player's name chip).
 */
export default function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-4 px-5 py-4 sm:px-10 sm:py-[22px]">
      <Link href="/" aria-label="Talo, inicio" className="rounded-lg">
        <span className="sm:hidden">
          <TaloLogo size="sm" />
        </span>
        <span className="hidden sm:inline">
          <TaloLogo size="md" />
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3.5 py-2.5 font-semibold text-talo-ink underline-offset-[6px] hover:underline"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {right}
      </div>
    </header>
  );
}

/** Black footer with the giant yellow wordmark. */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-talo-ink text-white">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="flex flex-wrap justify-between gap-4 text-[17px] font-semibold text-[#DDDDDD]">
          <span>Talo · Juegos para jugar juntos</span>
          <span>Gratis, sin registrarse y desde el celular.</span>
        </div>
        <p
          aria-hidden="true"
          className="-mb-[0.16em] font-display text-[clamp(150px,27vw,400px)] leading-none tracking-[-0.03em] text-talo-hero"
        >
          talo
        </p>
      </div>
    </footer>
  );
}
