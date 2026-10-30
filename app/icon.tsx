import { ImageResponse } from "next/og";

// The browser tab's icon: the logo's talo-"o" (yellow, two eyes looking ahead),
// generated as a PNG at build time so every browser takes it.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export function TaloFace({ px, body = "#FFD400" }: { px: number; body?: string }) {
  const eye = px * 0.32;
  const pupil = eye * 0.5;
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        background: body,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: px * 0.06,
        paddingBottom: px * 0.04,
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            width: eye,
            height: eye,
            borderRadius: "50%",
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: pupil,
              height: pupil,
              borderRadius: "50%",
              background: "#111111",
              transform: `translate(${eye * 0.16}px, ${eye * 0.06}px)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "transparent" }}>
        <TaloFace px={64} />
      </div>
    ),
    size
  );
}
