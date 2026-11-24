import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import { Talo } from "@/components/Talo";
import NotFoundTracker from "./NotFoundTracker";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false },
};

/** Any unknown URL (and `notFound()`): a way back to the games, and a GA event with the broken path. */
export default function NotFound() {
  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="flex flex-1 flex-col overflow-hidden bg-talo-hero">
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col items-start gap-5 px-5 pb-14 pt-4 sm:px-10 sm:pt-10">
          <Talo w={84} h={84} color="#111111" radius="22px" expr="sorprendido" />
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[72px]">
            Aquí no hay ningún juego
          </h1>
          <p className="max-w-xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">
            El link está mal o la sala ya no existe: las salas se borran después de unos días sin jugar.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/#juegos"
              className="rounded-full bg-talo-ink px-6 py-3.5 text-[17px] font-bold text-white hover:bg-black"
            >
              Ver los juegos
            </Link>
            <Link
              href="/"
              className="rounded-full border-2 border-talo-ink px-6 py-3 text-[17px] font-bold text-talo-ink hover:bg-white/40"
            >
              Tengo un código
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
      <NotFoundTracker />
    </div>
  );
}
