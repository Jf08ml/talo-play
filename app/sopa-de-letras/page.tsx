"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function SopaHome() {
  return (
    <GameLobby game="sopa">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
