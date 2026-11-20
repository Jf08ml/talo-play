import { ImageResponse } from "next/og";
import { TaloFace } from "../../icon";

/**
 * The installed app's icons (`app/manifest.ts`, Android and others): the ink
 * talo on the brand's yellow, filled edge to edge with room around the face,
 * so it also works as a maskable icon (the system may crop it to a circle).
 */
export const dynamic = "force-static";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = SIZES.includes(Number(raw)) ? Number(raw) : 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFD400" }}>
        <TaloFace px={Math.round(size * 0.56)} body="#111111" />
      </div>
    ),
    { width: size, height: size }
  );
}
