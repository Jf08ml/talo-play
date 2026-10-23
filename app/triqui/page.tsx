"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function TriquiHome() {
  return (
    <GameLobby game="triqui">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
