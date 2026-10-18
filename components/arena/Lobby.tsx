"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

/** Create-room form: team size, how many rounds, bots to fill the places and how health comes back. */
export default function ArenaLobby() {
  return (
    <GameLobby game="arena">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
