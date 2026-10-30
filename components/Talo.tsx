"use client";
/**
 * Talo — the brand's character (from talo-handoff/Talo.tsx): a flat shape
 * with eyes, expressions and a gaze. Purely visual: it must never receive or
 * infer anything secret about a game (lib/taloEvents.ts has the rules).
 * Animations (blink, hop, pupils) are the `.talo-*` classes in globals.css.
 */
import type { CSSProperties } from "react";

export type TaloExpr =
  | "normal"
  | "contento"
  | "sospechoso"
  | "sorprendido"
  | "triste"
  | "ganador"
  | "pensando";

export interface TaloProps {
  /** Ancho y alto del cuerpo en px */
  w?: number;
  h?: number;
  /** Color plano del cuerpo */
  color?: string;
  /** border-radius del cuerpo (define la forma) */
  radius?: string;
  expr?: TaloExpr;
  /** Dirección de la mirada, -1..1 en cada eje (solo para "normal" y "sospechoso") */
  look?: [number, number];
  /** Delay del parpadeo, para que no parpadeen todos juntos */
  blinkDelay?: string;
  className?: string;
  style?: CSSProperties;
  /** Si el talo representa a un jugador, pasá su nombre para lectores de pantalla */
  label?: string;
}

export const TALOS = {
  pochi: { color: "#FF5FA2", w: 170, h: 170, radius: "50%" },
  tano: { color: "#2D5BFF", w: 116, h: 230, radius: "58px 58px 18px 18px" },
  dado: { color: "#00B26B", w: 156, h: 156, radius: "28px" },
  mora: { color: "#FF7A1A", w: 180, h: 112, radius: "90px 90px 14px 14px" },
  pipo: { color: "#8A4DFF", w: 96, h: 96, radius: "50%" },
  sombra: { color: "#111111", w: 100, h: 130, radius: "50px 50px 16px 16px" },
} as const;
export type TaloName = keyof typeof TALOS;

function isDark(hex: string) {
  const m = hex.replace("#", "");
  if (m.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.12;
}

export function Talo({
  w = 160,
  h = 160,
  color = "#FF5FA2",
  radius = "50%",
  expr = "normal",
  look = [0, 0],
  blinkDelay = "0s",
  className,
  style,
  label,
}: TaloProps) {
  const stroke = isDark(color) ? "#FFFFFF" : "#111111";
  const surprised = expr === "sorprendido";
  const happy = expr === "contento" || expr === "ganador";

  const base = Math.min(w, h * 1.1);
  const e = Math.round(base * 0.24 * (surprised ? 1.18 : 1)); // diámetro del ojo
  const p = Math.round(e * (surprised ? 0.3 : 0.46)); // diámetro de la pupila
  const gap = Math.max(3, Math.round(e * 0.24));
  const eyeTop = Math.round(Math.min(w, h) * 0.24);
  const t = Math.max(2, Math.round(e * 0.17)); // grosor de trazo
  const maxOff = (e - p) / 2 - 1;

  const looks: Partial<Record<TaloExpr, [number, number]>> = {
    normal: look,
    sospechoso: [look[0] || 1, 0.25],
    triste: [0, 0.9],
    sorprendido: [0, 0],
    pensando: [0.7, -0.8],
  };
  const [lx, ly] = looks[expr] ?? [0, 0];
  const px = lx * maxOff;
  const py = ly * maxOff;

  const lid =
    expr === "sospechoso" ? { h: 0.48, l: -6, r: -6 } : expr === "triste" ? { h: 0.36, l: -18, r: 18 } : null;

  const crownH = expr === "ganador" ? Math.round(w * 0.3) : 0;
  const crownW = Math.round(w * 0.5);
  const eyeH = happy ? Math.round(e * 0.55) : e;
  const mouthTop = eyeTop + eyeH + Math.round(e * 0.3);

  const mouth: CSSProperties | null = (() => {
    const common: CSSProperties = { position: "absolute", left: "50%", top: mouthTop, boxSizing: "border-box", borderStyle: "solid", borderColor: stroke };
    const mk = (mw: number, mh: number, extra: CSSProperties, shift = 0): CSSProperties => ({
      ...common, width: mw, height: mh, marginLeft: Math.round(-mw / 2 + shift), ...extra,
    });
    switch (expr) {
      case "contento": return mk(e, Math.round(e * 0.5), { borderWidth: `0 ${t}px ${t}px ${t}px`, borderRadius: `0 0 ${e}px ${e}px` });
      case "ganador": return mk(Math.round(e * 1.3), Math.round(e * 0.65), { borderWidth: 0, borderRadius: `0 0 ${e}px ${e}px`, background: stroke });
      case "triste": return mk(Math.round(e * 0.8), Math.round(e * 0.4), { borderWidth: `${t}px ${t}px 0 ${t}px`, borderRadius: `${e}px ${e}px 0 0` });
      case "sorprendido": return mk(Math.round(e * 0.42), Math.round(e * 0.52), { borderWidth: 0, borderRadius: "50%", background: stroke });
      case "sospechoso": return mk(Math.round(e * 0.55), t, { borderWidth: 0, borderRadius: t, background: stroke }, Math.round(e * 0.3));
      case "pensando": return mk(Math.round(e * 0.45), t, { borderWidth: 0, borderRadius: t, background: stroke }, Math.round(e * 0.45));
      default: return null;
    }
  })();

  const eyeStyle: CSSProperties = happy
    ? { width: e, height: eyeH, boxSizing: "border-box", borderStyle: "solid", borderColor: stroke, borderWidth: `${t}px ${t}px 0 ${t}px`, borderRadius: `${e}px ${e}px 0 0` }
    : { width: e, height: e, borderRadius: "50%", background: "#FFFFFF" };

  const renderEye = (rot: number) => (
    <span style={{ position: "relative", display: "block", overflow: "hidden", ...eyeStyle }}>
      {!happy && (
        <span
          className="talo-pupil"
          style={{
            position: "absolute", left: "50%", top: "50%", width: p, height: p, margin: `${-p / 2}px 0 0 ${-p / 2}px`,
            borderRadius: "50%", background: "#111111", transform: `translate(${px}px, ${py}px)`,
          }}
        />
      )}
      {lid && (
        <span
          style={{
            position: "absolute", left: -Math.round(e * 0.25), top: -Math.round(e * 0.25), width: Math.round(e * 1.5),
            height: Math.round(e * 0.25 + e * lid.h), background: color, transform: `rotate(${rot}deg)`,
          }}
        />
      )}
    </span>
  );

  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: "relative", display: "inline-block", width: w, height: h + crownH, ...style }}
    >
      {crownH > 0 && (
        <svg viewBox="0 0 40 24" style={{ position: "absolute", top: 0, left: "50%", width: crownW, height: Math.round(crownW * 0.6), marginLeft: -crownW / 2, overflow: "visible" }}>
          <path d="M3 22 L6 6 L14 13 L20 2 L26 13 L34 6 L37 22 Z" fill="#FFD400" stroke="#111111" strokeWidth={2.5} strokeLinejoin="round" />
        </svg>
      )}
      <span style={{ position: "absolute", left: 0, bottom: 0, width: w, height: h, background: color, borderRadius: radius }}>
        <span
          className="talo-eyes"
          style={{ position: "absolute", left: "50%", top: eyeTop, marginLeft: -(2 * e + gap) / 2, display: "flex", gap, animationDelay: blinkDelay }}
        >
          {renderEye(lid?.l ?? 0)}
          {renderEye(lid?.r ?? 0)}
        </span>
        {mouth && <span style={mouth} />}
      </span>
    </span>
  );
}

/**
 * Helper para la mirada que sigue al cursor (hero de la home).
 * Devuelve [-1..1, -1..1] desde el centro de los ojos hacia el punto objetivo.
 */
export function lookToward(eyeCenter: { x: number; y: number }, target: { x: number; y: number }, reach = 120): [number, number] {
  const dx = target.x - eyeCenter.x;
  const dy = target.y - eyeCenter.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / reach);
  return [(dx / d) * k, (dy / d) * k];
}
