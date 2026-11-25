"use client";

import GameLobby from "@/components/GameLobby";
import OnlineTabs from "@/components/OnlineTabs";
import { CreateRoomForm } from "@/components/RoomSettings";
import { createBackgammonRoom } from "@/lib/backgammon";
import { SETTINGS } from "./settings";

/** Online matches are to 3 points: long enough to use the cube, short enough for a sitting. */
const ONLINE_MATCH_TO = 3;

export default function BackgammonHome() {
  return (
    <GameLobby game="backgammon">
      <OnlineTabs
        game="backgammon"
        text="Te emparejamos al momento con alguien que también quiere jugar. Partido a 3 puntos, con cubo de doblar; los colores se sortean."
        create={(hostId, vs) => createBackgammonRoom(ONLINE_MATCH_TO, hostId, vs)}
        friends={<CreateRoomForm settings={SETTINGS} />}
      />
    </GameLobby>
  );
}
