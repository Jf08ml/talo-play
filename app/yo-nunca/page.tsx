"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function YoNuncaHome() {
  return (
    <GameLobby game="yonunca">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
