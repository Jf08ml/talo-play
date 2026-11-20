import Link from "next/link";
import type { ReactNode } from "react";
import TaloLogo from "./TaloLogo";
import FriendsLink from "./FriendsLink";
import IdeasButton from "./IdeasButton";
import PlazaButton from "./PlazaButton";
import { CATEGORIES, CONTEXTS, GAMES } from "@/lib/games";
import { contextLanding, shelfLanding } from "@/lib/landings";

const NAV = [
  { href: "/#juegos", label: "Juegos" },
  { href: "/#como", label: "Cómo funciona" },
  { href: "/#faq", label: "Ayuda" },
  { href: "/ideas", label: "Ideas" },
];

/**
 * The top of Talo's light pages (home, lobbies). It sits inside each page's
 * colored hero, so it has no background of its own. `right` goes after the
 * nav and "Amigos" (the player's name chip).
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
        <FriendsLink />
        {right}
      </div>
    </header>
  );
}

/** Black footer with the giant yellow wordmark. Also brings the floating "Ideas" button to every light page and the "Plaza" one (bottom left). */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-talo-ink text-white">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-5 pt-16 sm:px-10 sm:pt-[72px]">
        <div className="flex flex-wrap justify-between gap-4 text-[17px] font-semibold text-[#DDDDDD]">
          <span>Talo · Juegos para jugar juntos</span>
          <span>Gratis, sin registrarse y desde el celular.</span>
        </div>
        {/* Every game and landing page, linked from every light page (helps people and search engines find them). */}
        <nav aria-label="Todos los juegos" className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/15 py-10 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <Link href={`/${shelfLanding(c.id).slug}`} className="text-[15px] font-extrabold text-talo-hero underline-offset-4 hover:underline">
                {c.label}
              </Link>
              <ul className="flex flex-col gap-1.5">
                {c.games.map((id) => (
                  <li key={id}>
                    <Link href={`/${GAMES[id].path}`} className="text-[14px] text-[#CCCCCC] underline-offset-4 hover:text-white hover:underline">
                      {GAMES[id].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] font-semibold text-[#DDDDDD]">
          <span>Para jugar:</span>
          {CONTEXTS.map((c) => (
            <Link key={c.id} href={`/${contextLanding(c.id).slug}`} className="text-white underline-offset-4 hover:underline">
              {c.label.toLowerCase()}
            </Link>
          ))}
        </p>
        <Link href="/ideas" className="w-fit text-[17px] font-semibold text-talo-hero underline-offset-4 hover:underline">
          ¿Qué juego sumamos? Dejanos tu idea
        </Link>
        <p
          aria-hidden="true"
          className="-mb-[0.16em] font-display text-[clamp(150px,27vw,400px)] leading-none tracking-[-0.03em] text-talo-hero"
        >
          talo
        </p>
      </div>
      <IdeasButton />
      <PlazaButton />
    </footer>
  );
}
