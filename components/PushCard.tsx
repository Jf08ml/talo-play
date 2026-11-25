"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { disablePush, enablePush, needsInstallForPush, pushEnabled, pushSupported } from "@/lib/push";
import { trackEvent } from "@/lib/analytics";
import InstallButton from "./InstallButton";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

/**
 * Notifications on this device (lib/push.ts), for the friends page: when a
 * friend invites you, sends you a request or a message, or accepts yours.
 */
export default function PushCard({ uid, className = "" }: { uid: string; className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (needsInstallForPush()) return "install" as const;
      if (!pushSupported()) return "unsupported" as const;
      if (Notification.permission === "denied") return "denied" as const;
      return (await pushEnabled()) ? ("on" as const) : ("off" as const);
    };
    check()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "unsupported") return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const ok = await enablePush(uid);
      setState(ok ? "on" : Notification.permission === "denied" ? "denied" : "off");
      trackEvent("push_toggle", { on: ok });
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush(uid).catch(console.error);
    setState("off");
    trackEvent("push_toggle", { on: false });
    setBusy(false);
  };

  return (
    <section className={`rounded-[24px] border-2 border-talo-ink bg-white p-4 sm:p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${state === "on" ? "bg-talo-hero" : "bg-talo-surface"}`}>
          {state === "on" ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[24px] leading-[1.05] sm:text-[28px]">Notificaciones</h2>
          <p className="text-[15px] text-talo-text-2">
            {state === "on" ? "Activadas en este dispositivo." : "Te avisamos cuando un amigo te invita, te escribe o te manda una solicitud."}
          </p>
        </div>
      </div>
      {state === "install" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[15px] text-talo-text-2">En iPhone y iPad las notificaciones funcionan con Talo instalado en la pantalla de inicio. Instálalo y actívalas desde ahí.</p>
          <InstallButton className="min-h-[48px] rounded-[14px] bg-talo-ink px-5 font-bold text-white" />
        </div>
      )}
      {state === "denied" && (
        <p className="mt-4 text-[15px] text-talo-text-2">
          Las bloqueaste en este navegador. Para activarlas, permite las notificaciones de Talo en la configuración del sitio (el candado junto a la dirección) y
          vuelve a esta página.
        </p>
      )}
      {(state === "off" || state === "on") && (
        <button
          disabled={busy}
          onClick={state === "on" ? turnOff : turnOn}
          className={`mt-4 min-h-[48px] w-full rounded-[14px] font-bold transition ${
            state === "on" ? "border-2 border-talo-ink text-talo-ink hover:bg-talo-surface" : "bg-talo-ink text-white hover:bg-black"
          }`}
        >
          {busy ? "Un momento…" : state === "on" ? "Desactivar" : "Activar notificaciones"}
        </button>
      )}
    </section>
  );
}
