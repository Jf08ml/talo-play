import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import HomeClient from "./HomeClient";
import JsonLd from "@/components/JsonLd";
import { TaloMark } from "@/components/TaloLogo";
import { HOME_FAQ, SITE_DESCRIPTION, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Talo · Juegos online gratis para jugar con amigos, en pareja o en grupo" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const STEPS = [
  { title: "Elegí un juego", text: "Para dos, para la previa o para un rato solo. Cada juego te dice para cuántos es y cuánto dura." },
  { title: "Mandá el link", text: "Creás la sala y compartís el link o el código por WhatsApp. Nadie tiene que registrarse." },
  { title: "A jugar", text: "Los demás tocan el link, ponen su nombre y entran. Todo pasa en vivo, cada uno desde su celular." },
];

export default function Home() {
  return (
    <>
      <HomeClient />
      {/* Server-rendered so search engines and AI assistants can read it; also the FAQPage JSON-LD. */}
      <div className="border-t border-white/[0.06] bg-slate-950/40">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">Cómo funciona</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-white/[0.07] bg-slate-900/40 p-5">
                <span className="font-mono text-sm text-violet-400">0{i + 1}</span>
                <p className="mt-3 font-display text-lg font-semibold text-white">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:gap-14">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">Preguntas frecuentes</h2>
            <p className="mt-2 text-sm text-slate-400">Lo que más nos preguntan antes de la primera partida.</p>
          </div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {HOME_FAQ.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-100 marker:hidden">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 pr-8 text-sm leading-relaxed text-slate-400">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <span className="flex items-center gap-2">
            <TaloMark className="h-5 w-5" /> Talo · Juegos para jugar juntos
          </span>
          <span>Gratis, sin registrarse y desde el celular.</span>
        </div>
      </footer>
      <JsonLd data={homeJsonLd()} />
    </>
  );
}
