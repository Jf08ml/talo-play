// Red vs blue teams, shared by every game with a team mode.
export type TeamId = "red" | "blue";

export const TEAMS: { id: TeamId; label: string; color: string }[] = [
  { id: "red", label: "Equipo Rojo", color: "#fb3a5d" },
  { id: "blue", label: "Equipo Azul", color: "#22d3ee" },
];
