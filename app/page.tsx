import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import JsonLd from "@/components/JsonLd";
import { HOME_FAQ, SITE_DESCRIPTION, homeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Talo · Juegos online gratis para jugar con amigos, en pareja o en grupo" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <HomeClient />
      {/* Server-rendered so search engines and AI assistants can read it; also the FAQPage JSON-LD. */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <h2 className="text-center font-display text-xl font-semibold text-slate-100">Preguntas frecuentes</h2>
        <div className="mt-4 flex flex-col gap-2">
          {HOME_FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <summary className="cursor-pointer list-none font-medium text-slate-200 marker:hidden">
                {q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <JsonLd data={homeJsonLd()} />
    </>
  );
}
