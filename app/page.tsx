import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import HomeClient from "./HomeClient";
import JsonLd from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteHeader";
import { HOME_FAQ, SITE_DESCRIPTION, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Talo · Juegos online gratis para jugar con amigos, en pareja o en grupo" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const STEPS = [
  { color: "#FF5FA2", title: "Elegí un juego", text: "Para la previa, de mesa, de cartas o para jugar solo. Todos en español." },
  { color: "#2D5BFF", title: "Mandá el link", text: "Por WhatsApp o pasando el código de la sala. Cada uno entra con su nombre." },
  { color: "#00A863", title: "A jugar", text: "Todo se sincroniza en vivo: en la misma mesa o cada uno en su casa, por videollamada." },
];

const H2 = "font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]";

export default function Home() {
  return (
    <>
      <HomeClient />
      {/* Server-rendered so search engines and AI assistants can read it; also the FAQPage JSON-LD. */}
      <div className="talo-light">
        <section id="como" className="scroll-mt-4 bg-talo-surface">
          <div className="mx-auto grid max-w-[1360px] gap-10 px-5 py-[72px] sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] sm:gap-12 sm:px-10 sm:py-28">
            <h2 className={H2}>En un minuto están jugando</h2>
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex flex-col gap-3">
                <span className="font-display text-[64px] leading-none" style={{ color: s.color }}>
                  {i + 1}
                </span>
                <h3 className="text-2xl font-extrabold">{s.title}</h3>
                <p className="text-lg text-talo-text-2">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="faq"
          className="mx-auto grid max-w-[1360px] scroll-mt-4 items-start gap-8 px-5 py-[72px] sm:px-10 sm:py-28 lg:grid-cols-3 lg:gap-12"
        >
          <h2 className={H2}>Preguntas</h2>
          <div className="min-w-0 border-t-2 border-talo-ink lg:col-span-2">
            {HOME_FAQ.map(({ q, a }) => (
              <details key={q} className="group border-b border-talo-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-1 py-5 text-lg font-bold sm:py-[22px] sm:text-[21px] [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="h-[22px] w-[22px] shrink-0 transition-transform duration-200 group-open:rotate-180" strokeWidth={2.4} />
                </summary>
                <p className="max-w-[720px] px-1 pb-6 text-lg leading-normal text-talo-text-2">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <SiteFooter />
      </div>
      <JsonLd data={homeJsonLd()} />
    </>
  );
}
