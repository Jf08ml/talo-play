"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function EmojisHome() {
  return (
    <GameLobby game="emojis">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
