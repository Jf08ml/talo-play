"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function TrucoHome() {
  return (
    <GameLobby game="truco">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
