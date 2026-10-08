import { ImageResponse } from "next/og";

// Link preview for every page (WhatsApp, Telegram, etc.); room pages only
// change the title/description. Built at build time, no fonts or emoji to fetch.
export const alt = "Talo · Juegos para jugar juntos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 20% 0%, #3b0764 0%, #07060d 55%), #07060d",
          color: "#e6e4f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", position: "relative", width: 170, height: 120 }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 120,
                height: 120,
                borderRadius: 999,
                background: "linear-gradient(135deg, #a78bfa, #e879f9)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 50,
                top: 0,
                width: 120,
                height: 120,
                borderRadius: 999,
                background: "linear-gradient(135deg, #22d3ee, #34d399)",
                opacity: 0.85,
              }}
            />
          </div>
          <div style={{ fontSize: 170, fontWeight: 800, letterSpacing: -6, color: "#f5f3ff" }}>talo</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 52, fontWeight: 700, color: "#f5f3ff" }}>
          Juegos para jugar juntos
        </div>
        <div style={{ marginTop: 14, fontSize: 32, color: "#a5a3c2" }}>
          Elegí un juego, mandá el link y ya están jugando
        </div>
      </div>
    ),
    size
  );
}
