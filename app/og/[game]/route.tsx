import { ImageResponse } from "next/og";
import { gameScene } from "@/components/GameArt";
import { svgString } from "@/lib/svgString";
import { GAME_ORDER, GAMES, playersLabel, type GameId } from "@/lib/games";
import { categoryOf, gameColors } from "@/lib/talos";
import { TaloFace } from "../../icon";

/**
 * Each game's link preview (its lobby, and its rooms' invites): the game's
 * scene on its shelf's color, with its name and what it is. Built at build
 * time for every game; the scene is the same SVG as `GameArt`.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return GAME_ORDER.map((game) => ({ game }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game: raw } = await params;
  const game = (raw in GAMES ? raw : "trivia") as GameId;
  const info = GAMES[game];
  const { color, ink } = gameColors(game);
  const title = info.title;
  const big = title.length > 14 ? 76 : 96;
  // The scene as an SVG image (the image renderer can't take React fragments inline).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="520" height="520" font-family="sans-serif">${svgString(gameScene(game))}</svg>`;
  const art = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: color, color: ink, fontFamily: "sans-serif", padding: "56px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 56, fontWeight: 900, letterSpacing: -2 }}>
            tal
            <div style={{ display: "flex", marginLeft: 3, marginTop: 10 }}>
              <TaloFace px={44} body={ink} />
            </div>
          </div>
          <div style={{ marginTop: 26, fontSize: 26, fontWeight: 700, opacity: 0.8 }}>{categoryOf(game).label}</div>
          <div style={{ marginTop: 8, fontSize: big, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>{title}</div>
          <div style={{ marginTop: 22, fontSize: 30, fontWeight: 600, lineHeight: 1.25, display: "flex" }}>
            {info.tagline.length > 120 ? `${info.tagline.slice(0, 117)}…` : info.tagline}
          </div>
          <div style={{ marginTop: "auto", display: "flex", gap: 14, fontSize: 26, fontWeight: 800 }}>
            <span style={{ background: ink, color, padding: "8px 18px", borderRadius: 999 }}>{playersLabel(info)} jugadores</span>
            <span style={{ background: ink, color, padding: "8px 18px", borderRadius: 999 }}>Gratis · sin registrarse</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> */}
        <img src={art} width={520} height={520} alt="" style={{ position: "absolute", right: 24, bottom: 24 }} />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
