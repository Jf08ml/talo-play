import { ImageResponse } from "next/og";
import { TaloFace } from "./icon";

// The home-screen icon on iPhones: the ink talo on the brand's yellow (iOS
// rounds the corners itself, so the square is filled edge to edge).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFD400",
        }}
      >
        <TaloFace px={124} body="#111111" />
      </div>
    ),
    size
  );
}
