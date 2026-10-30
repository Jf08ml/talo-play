import { ImageResponse } from "next/og";
import { TaloFace } from "./icon";

// Link preview for every page (WhatsApp, Telegram, etc.); room pages only
// change the title/description. Built at build time, no fonts or emoji to
// fetch: the home's yellow hero in miniature, with a few talos at the bottom.
export const alt = "Talo · Juegos para jugar juntos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Flat talos standing on the bottom edge (as in the home's hero).
const CROWD = [
  { w: 210, h: 210, r: "50%", c: "#FF5FA2" },
  { w: 130, h: 290, r: "65px 65px 18px 18px", c: "#2D5BFF" },
  { w: 170, h: 170, r: "30px", c: "#00B26B" },
  { w: 160, h: 104, r: "80px 80px 14px 14px", c: "#FF7A1A" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#FFD400",
          color: "#111111",
          fontFamily: "sans-serif",
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 72, fontWeight: 900, letterSpacing: -3 }}>
            tal
            <div style={{ display: "flex", marginLeft: 4, marginTop: 14 }}>
              <TaloFace px={56} body="#111111" />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40, fontSize: 92, fontWeight: 900, lineHeight: 0.98, letterSpacing: -4 }}>
            <span>Juegos para</span>
            <span>jugar juntos.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 32, fontWeight: 600, maxWidth: 430 }}>
            Mandá el link por WhatsApp y en un minuto están jugando.
          </div>
        </div>

        <div style={{ position: "absolute", right: 56, bottom: 0, display: "flex", alignItems: "flex-end", gap: 0 }}>
          {CROWD.map((t, i) => (
            <div
              key={i}
              style={{
                width: t.w,
                height: t.h,
                marginLeft: i ? -18 : 0,
                borderRadius: t.r,
                background: t.c,
                display: "flex",
                justifyContent: "center",
                paddingTop: Math.min(t.w, t.h) * 0.2,
              }}
            >
              {[0, 1].map((k) => (
                <div
                  key={k}
                  style={{
                    width: Math.min(t.w, t.h) * 0.24,
                    height: Math.min(t.w, t.h) * 0.24,
                    marginLeft: k ? Math.min(t.w, t.h) * 0.06 : 0,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: Math.min(t.w, t.h) * 0.11,
                      height: Math.min(t.w, t.h) * 0.11,
                      borderRadius: "50%",
                      background: "#111111",
                      transform: "translate(-4px, -2px)",
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
