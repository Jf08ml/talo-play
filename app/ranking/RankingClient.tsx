"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy } from "lucide-react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import PlayerIdentity from "@/components/PlayerIdentity";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { SignInButton } from "@/components/FriendInvite";
import { useAccount } from "@/components/AccountProvider";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { isFirebaseConfigured } from "@/lib/firebase";
import { DAILY_CAP, PLACE_BONUS, PLAY, getMyPoints, getRanking, weekKey, type RankRow } from "@/lib/rank";

type Scope = "week" | "all";

/** «Ranking de Talo»: the week's and all-time tables (accounts only), my points and how to earn them. */
export default function RankingClient() {
  const identity = useClientIdentity();
  const { user } = useAccount();
  const [scope, setScope] = useState<Scope>("week");
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [mine, setMine] = useState<RankRow | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    const key = scope === "all" ? "all" : weekKey();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new table loads from scratch
    setRows(null);
    Promise.all([getRanking(key, 50), getMyPoints(key)])
      .then(([r, m]) => {
        if (cancelled) return;
        setRows(r);
        setMine(m);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, identity.clientId, user?.uid]);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;
  const myPlace = rows && mine ? rows.findIndex((r) => r.id === mine.id) + 1 : 0;

  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden bg-talo-hero">
        <SiteHeader right={<PlayerIdentity identity={identity} requireName={false} compact />} />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-5 pb-10 pt-2 sm:px-10 sm:pb-14 sm:pt-6">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">Ranking</h1>
          <p className="max-w-xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">
            Suma puntos jugando con amigos o en línea, y más si ganas. El de la semana empieza de cero cada lunes.
          </p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1360px] flex-1 items-start gap-6 px-4 py-8 sm:px-10 sm:py-14 md:grid-cols-[1.3fr_1fr] lg:gap-10">
        <section className="rounded-[24px] border-2 border-talo-ink bg-white p-4 sm:p-6">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-talo-surface p-1">
            {(["week", "all"] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`min-h-[44px] rounded-lg text-[15px] font-bold transition ${scope === s ? "bg-talo-ink text-white" : "text-talo-ink hover:bg-white"}`}
              >
                {s === "week" ? "Esta semana" : "De siempre"}
              </button>
            ))}
          </div>
          {rows === null ? (
            <p className="py-8 text-center text-[15px] text-talo-text-3">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-[15px] text-talo-text-2">Todavía no hay nadie. ¡Juega una partida y sé el primero!</p>
          ) : (
            <ol className="flex flex-col divide-y divide-talo-line">
              {rows.map((r, i) => (
                <li key={r.id} className={`flex items-center gap-3 py-2.5 ${mine?.id === r.id ? "rounded-xl bg-talo-hero/40 px-2" : ""}`}>
                  <span className="w-8 shrink-0 text-center font-display text-[20px]">
                    {i === 0 ? <Crown className="mx-auto h-6 w-6 fill-talo-hero text-talo-ink" /> : i + 1}
                  </span>
                  <span className="h-8 w-8 shrink-0 rounded-[10px]" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-[17px] font-bold">
                    {r.name}
                    {mine?.id === r.id && <span className="font-medium text-talo-text-2"> · tú</span>}
                  </span>
                  <span className="font-mono text-[17px] font-bold tabular-nums">{r.p}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-[24px] bg-talo-surface p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6" />
              <h2 className="font-display text-[24px] leading-tight">Tus puntos</h2>
            </div>
            {mine ? (
              <p className="mt-2 text-[17px]">
                {scope === "week" ? "Esta semana llevas" : "En total llevas"} <b className="font-display text-[24px]">{mine.p}</b> puntos
                {mine.uid && myPlace > 0 && (
                  <>
                    {" "}
                    · puesto <b>#{myPlace}</b>
                  </>
                )}
                .
              </p>
            ) : (
              <p className="mt-2 text-[17px] text-talo-text-2">Todavía no sumaste puntos {scope === "week" ? "esta semana" : ""}. Juega una partida para empezar.</p>
            )}
            {!user && (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-[15px] text-talo-text-2">
                  En el ranking aparecen los jugadores con cuenta. Entra con Google y tus puntos se muestran ahí (los que ya sumaste en este dispositivo también).
                </p>
                <SignInButton light />
              </div>
            )}
            {user && mine && !mine.uid && (
              <p className="mt-3 text-[15px] text-talo-text-2">Juega una partida más y apareces en el ranking con tu cuenta.</p>
            )}
          </section>

          <section className="rounded-[24px] bg-talo-surface p-5 sm:p-6">
            <h2 className="font-display text-[24px] leading-tight">Cómo se suman</h2>
            <ul className="mt-3 flex flex-col gap-2 text-[15px] text-talo-text-2">
              <li>
                · <b>{PLAY} puntos</b> por cada partida que juegas hasta el final en una sala, con amigos o en línea.
              </li>
              <li>
                · Si ganas, <b>+{PLACE_BONUS[0]}</b>; si sales segundo, <b>+{PLACE_BONUS[1]}</b>; tercero, <b>+{PLACE_BONUS[2]}</b> (cuando hay podio).
              </li>
              <li>· Las partidas solo contra bots valen la mitad.</li>
              <li>· Puedes sumar hasta {DAILY_CAP} puntos por día.</li>
            </ul>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
