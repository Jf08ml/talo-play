"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function GolpeLobby() {
  return (
    <GameLobby game="golpe">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
