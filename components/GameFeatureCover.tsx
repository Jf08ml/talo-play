import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";
import { gameColors } from "@/lib/talos";
import GameArt from "@/components/GameArt";
import NewBadge from "@/components/NewBadge";

export default function GameFeatureCover({ game }: { game: GameId }) {
  const info = GAMES[game];
  const colors = gameColors(game);
  const players = info.minPlayers === info.maxPlayers
    ? `${info.minPlayers} ${info.minPlayers === 1 ? "jugador" : "jugadores"}`
    : `${info.minPlayers}+ jugadores`;

  return (
    <Link
      href={`/${info.path}`}
      aria-label={`${info.title}. ${info.tagline} ${players}`}
      className="group relative block aspect-[9/16] w-[min(68vw,220px)] shrink-0 snap-start overflow-hidden rounded-[22px] border-2 border-talo-ink bg-white shadow-[3px_3px_0_#111] transition duration-200 hover:-translate-y-1 hover:shadow-[5px_6px_0_#111] focus-visible:shadow-[5px_6px_0_#111] sm:w-full sm:max-w-[220px] sm:rounded-[24px]"
    >
      <NewBadge game={game} className="absolute left-2 top-2 z-20 shadow-[2px_2px_0_#111] sm:left-3 sm:top-3" />
      <span className="absolute inset-x-0 top-0 h-[60%] overflow-hidden" style={{ background: colors.color }}>
        <span aria-hidden="true" className="absolute -right-[18%] -top-[12%] h-[80%] aspect-square rounded-full border-[16px] border-white/20 sm:border-[20px]" />
        <span aria-hidden="true" className="absolute -bottom-[28%] -left-[20%] h-[72%] aspect-square rounded-full bg-black/10" />
        <GameArt game={game} className="absolute inset-0 h-full w-full scale-[1.15] drop-shadow-[0_7px_0_rgba(17,17,17,0.12)] transition-transform duration-300 group-hover:scale-[1.23]" />
      </span>
      <span className="absolute inset-x-0 bottom-0 flex h-[40%] flex-col justify-center gap-1.5 border-t-2 border-talo-ink bg-white px-2.5 py-2.5 sm:gap-2 sm:px-3 sm:py-3">
        <span className="line-clamp-2 font-extrabold leading-[1.05] text-talo-ink [font-size:clamp(15px,1.4vw,20px)]">{info.title}</span>
        <span className="line-clamp-3 text-[12px] leading-snug text-talo-text-2 sm:text-[13px]">{info.tagline}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-talo-text-3 sm:text-xs">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.color }} />
          {players}
        </span>
      </span>
    </Link>
  );
}
