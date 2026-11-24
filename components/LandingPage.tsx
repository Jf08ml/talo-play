import Link from "next/link";
import { ArrowRight, ChevronDown, Clock, Users } from "lucide-react";
import SiteHeader, { SiteFooter } from "./SiteHeader";
import GameArt from "./GameArt";
import NewBadge from "./NewBadge";
import JsonLd from "./JsonLd";
import { GAMES, playersLabel } from "@/lib/games";
import { gameColors } from "@/lib/talos";
import { LANDINGS, landing } from "@/lib/landings";
import { landingJsonLd } from "@/lib/seo";

const H2 = "font-display text-[28px] leading-[1.05] sm:text-[36px]";

/**
 * A landing page for a search (`lib/landings.ts`): what it is, every game
 * that fits with its description, questions, and the other landings. A
 * server component: all of it is in the HTML.
 */
export default function LandingPage({ slug }: { slug: string }) {
  const l = landing(slug);
  const others = LANDINGS.filter((o) => o.slug !== slug);
  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden" style={{ background: l.color, color: l.ink }}>
        <SiteHeader />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-5 pb-12 pt-2 sm:px-10 sm:pb-16 sm:pt-6">
          <nav aria-label="Ruta" className="text-[15px] font-bold">
            <Link href="/" className="underline-offset-4 hover:underline" style={{ color: l.ink }}>
              Talo
            </Link>{" "}
            · {l.label}
          </nav>
          <h1 className="max-w-4xl text-balance font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">{l.h1}</h1>
          {l.intro.map((p) => (
            <p key={p} className="max-w-3xl text-[17px] font-medium leading-[1.45] sm:text-[21px]">
              {p}
            </p>
          ))}
          <p className="text-[15px] font-bold">{l.games.length} juegos · gratis · sin registrarse</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1360px] px-5 py-10 sm:px-10 sm:py-16">
        <h2 className={H2}>Los juegos</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {l.games.map((id) => {
            const g = GAMES[id];
            const { color, ink } = gameColors(id);
            return (
              <li key={id}>
                <Link
                  href={`/${g.path}`}
                  className="flex h-full gap-4 rounded-[24px] p-4 transition-transform duration-200 hover:-translate-y-1"
                  style={{ background: color, color: ink }}
                >
                  <GameArt game={id} className="h-24 w-24 shrink-0 self-center" />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="font-display text-[24px] leading-none">{g.title}</h3>
                    <NewBadge game={id} className="self-start" />
                    <span className="text-[15px] font-medium leading-snug">{g.tagline}</span>
                    <span className="mt-auto flex flex-wrap gap-x-3 text-[13px] font-bold opacity-80">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {playersLabel(g)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {g.duration}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-talo-surface">
        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-5 py-12 sm:px-10 sm:py-16 md:grid-cols-[1fr_1.4fr] lg:gap-12">
          <h2 className={H2}>Preguntas frecuentes</h2>
          <div className="flex flex-col border-t-2 border-talo-ink">
            {l.faq.map(({ q, a }) => (
              <details key={q} className="group border-b border-talo-line py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[18px] font-bold [&::-webkit-details-marker]:hidden">
                  <h3>{q}</h3>
                  <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[17px] leading-relaxed text-talo-text-2">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1360px] px-5 py-12 sm:px-10 sm:py-16">
        <h2 className={H2}>Más formas de jugar</h2>
        <ul className="mt-6 flex flex-wrap gap-2.5">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/${o.slug}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-talo-ink px-4 font-bold hover:bg-talo-surface">
                {o.label} <ArrowRight className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <SiteFooter />
      <JsonLd data={landingJsonLd(slug)} />
    </div>
  );
}
