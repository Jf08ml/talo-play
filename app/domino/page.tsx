"use client";

import GameLobby from "@/components/GameLobby";
import OnlineTabs from "@/components/OnlineTabs";
import { CreateRoomForm } from "@/components/RoomSettings";
import { createDominoRoom } from "@/lib/domino";
import { SETTINGS } from "./settings";

/** Online games are one on one, to 100 points. */
const ONLINE_TARGET = 100;

export default function DominoHome() {
  return (
    <GameLobby game="domino">
      <OnlineTabs
        game="domino"
        text="Te emparejamos al momento con alguien que también quiere jugar: mano a mano, con pozo, a 100 puntos. Para jugar en parejas, arma una sala con amigos."
        create={(hostId, vs) => createDominoRoom(ONLINE_TARGET, hostId, vs)}
        friends={<CreateRoomForm settings={SETTINGS} />}
      />
    </GameLobby>
  );
}
