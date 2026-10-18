"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

/** Create-room form: map, mode, how many fighters, kills to win, time and bots. */
export default function FuegoLobby() {
  return (
    <GameLobby game="fuego">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
