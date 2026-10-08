"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  getRoomMeta,
  subscribePieces,
  subscribeRace,
  startRace,
  reportTeamFinished,
  type PieceState,
  type RoomMeta,
  type RaceState,
} from "@/lib/puzzleRoom";
import { TEAMS, type TeamId } from "@/lib/teams";
import { joinPresence, subscribePresence, type PresenceMap } from "@/lib/presence";
import { generatePuzzleLayout, type PuzzleLayout } from "@/lib/puzzleGeometry";
import { renderPieceBitmaps, type PieceBitmap } from "@/lib/piecesRender";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import NamePrompt from "@/components/NamePrompt";
import CompletionBanner from "@/components/CompletionBanner";
import PlayerBadges from "@/components/PlayerBadges";
import ProgressBar from "@/components/ProgressBar";
import RaceBar from "@/components/RaceBar";
import TeamPicker from "@/components/TeamPicker";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import RoomHeader from "@/components/RoomHeader";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";

const PuzzleStage = dynamic(() => import("@/components/PuzzleStage"), {
  ssr: false,
});

type Status = "loading" | "not-found" | "ready" | "error";

const EMPTY_RACE: RaceState = {
  status: "waiting",
  startedAt: null,
  finishedAt: {},
  winner: null,
};

function teamStorageKey(roomId: string) {
  return `rompecabezas.team.${roomId}`;
}

function readStoredTeam(roomId: string): TeamId | null {
  const saved = localStorage.getItem(teamStorageKey(roomId));
  return saved === "red" || saved === "blue" ? saved : null;
}

function subscribeNever() {
  return () => {};
}

function getServerTeamSnapshot() {
  return null;
}

export default function RoomClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [layout, setLayout] = useState<PuzzleLayout | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pieceBitmaps, setPieceBitmaps] = useState<Map<string, PieceBitmap> | null>(null);
  const [pieces, setPieces] = useState<Record<string, PieceState>>({});
  const [opponentPieces, setOpponentPieces] = useState<Record<string, PieceState>>({});
  const [presence, setPresence] = useState<PresenceMap>({});
  const [race, setRace] = useState<RaceState>(EMPTY_RACE);

  // A team explicitly picked this render session (takes precedence), falling
  // back to whatever was already stored in localStorage for this room —
  // read via useSyncExternalStore so it hydrates safely after mount instead
  // of needing an effect that calls setState synchronously.
  const [pickedTeam, setPickedTeam] = useState<TeamId | null>(null);
  const storedTeam = useSyncExternalStore(
    subscribeNever,
    useCallback(() => readStoredTeam(roomId), [roomId]),
    getServerTeamSnapshot
  );
  const myTeam = pickedTeam ?? storedTeam;
  const reportedFinishRef = useRef(false);

  const configured = isFirebaseConfigured();
  const isVersus = meta?.mode === "versus";

  const chooseTeam = (team: TeamId) => {
    localStorage.setItem(teamStorageKey(roomId), team);
    setPickedTeam(team);
  };

  // Load room metadata + build puzzle geometry once we know who we are.
  useEffect(() => {
    if (!configured) return;
    if (!identity.clientId || !identity.name) return;

    let cancelled = false;

    (async () => {
      try {
        const roomMeta = await getRoomMeta(roomId);
        if (cancelled) return;
        if (!roomMeta) {
          setStatus("not-found");
          return;
        }
        if (roomMeta.game && roomMeta.game !== "rompecabezas") {
          // A code from another game typed into this URL: let /sala route it.
          router.replace(`/sala/${roomId}`);
          return;
        }
        if (!roomMeta.imageWidth || !roomMeta.imageHeight) {
          // A room created from an image the browser couldn't actually decode
          // (rare, but possible before prepareImage started rejecting those)
          // would otherwise build a 0x0 layout and crash the canvas per-piece.
          throw new Error(
            "La imagen de esta sala está dañada o en un formato no soportado. Creá una sala nueva con otra imagen."
          );
        }

        const builtLayout = generatePuzzleLayout(
          roomMeta.rows,
          roomMeta.cols,
          roomMeta.imageWidth,
          roomMeta.imageHeight,
          roomMeta.seed
        );

        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
          img.src = roomMeta.imageUrl;
        });
        if (cancelled) return;

        const bitmaps = renderPieceBitmaps(img, builtLayout);
        if (cancelled) return;

        setMeta(roomMeta);
        setLayout(builtLayout);
        setImage(img);
        setPieceBitmaps(bitmaps);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, identity.clientId, identity.name, configured, router]);

  // Read-only presence peek so the team picker can show live headcounts
  // before this client has joined (and thus picked a color/team).
  useEffect(() => {
    if (!configured || !isVersus || myTeam) return;
    const unsub = subscribePresence(roomId, setPresence);
    return () => unsub();
  }, [configured, isVersus, myTeam, roomId]);

  // Presence + piece subscriptions — gated on having a team when this is a versus room.
  useEffect(() => {
    if (!configured || status !== "ready" || !identity.clientId || !identity.name || !meta) return;
    if (isVersus && !myTeam) return;

    const teamColor = isVersus && myTeam ? TEAMS.find((t) => t.id === myTeam)!.color : identity.color;

    const leavePresence = joinPresence(roomId, identity.clientId, {
      name: identity.name,
      color: teamColor,
      team: isVersus && myTeam ? myTeam : undefined,
    });
    const unsubPresence = subscribePresence(roomId, setPresence);
    const unsubMyPieces = subscribePieces(roomId, setPieces, isVersus ? myTeam! : undefined);

    let unsubOpponentPieces: (() => void) | undefined;
    let unsubRace: (() => void) | undefined;
    if (isVersus && myTeam) {
      const opponentTeam: TeamId = myTeam === "red" ? "blue" : "red";
      unsubOpponentPieces = subscribePieces(roomId, setOpponentPieces, opponentTeam);
      unsubRace = subscribeRace(roomId, setRace);
    }

    return () => {
      leavePresence();
      unsubPresence();
      unsubMyPieces();
      unsubOpponentPieces?.();
      unsubRace?.();
    };
  }, [roomId, status, identity.clientId, identity.name, identity.color, configured, meta, isVersus, myTeam]);

  const progress = useMemo(() => {
    const values = Object.values(pieces);
    const total = layout?.pieces.length ?? values.length;
    const placed = values.filter((p) => p.placed).length;
    return { placed, total };
  }, [pieces, layout]);

  const raceProgress = useMemo((): Record<TeamId, { placed: number; total: number }> | null => {
    if (!isVersus || !myTeam) return null;
    const opponentTeam: TeamId = myTeam === "red" ? "blue" : "red";
    const total = layout?.pieces.length ?? 0;
    return {
      [myTeam]: { placed: progress.placed, total },
      [opponentTeam]: {
        placed: Object.values(opponentPieces).filter((p) => p.placed).length,
        total,
      },
    } as Record<TeamId, { placed: number; total: number }>;
  }, [isVersus, myTeam, progress, opponentPieces, layout]);

  // Report to Firebase once my team finishes the puzzle while a race is live.
  useEffect(() => {
    if (!isVersus || !myTeam || race.status !== "racing" || reportedFinishRef.current) return;
    if (progress.total > 0 && progress.placed === progress.total) {
      reportedFinishRef.current = true;
      reportTeamFinished(roomId, myTeam).catch(() => {});
    }
  }, [isVersus, myTeam, race.status, progress, roomId]);

  if (!configured) {
    return <FirebaseSetupNotice />;
  }

  const showTeamPicker = status === "ready" && isVersus && !myTeam;
  const showBoard =
    status === "ready" && layout && image && pieceBitmaps && (!isVersus || myTeam);

  return (
    <div className="flex h-dvh flex-col">
      <RoomHeader
        game="rompecabezas"
        roomId={roomId}
        badges={
          isVersus && (
            <span className="rounded-md border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-1 text-xs font-medium text-fuchsia-300">
              ⚔️ Competencia
            </span>
          )
        }
        right={
          status === "ready" && (
            <>
              {!isVersus && <ProgressBar placed={progress.placed} total={progress.total} />}
              <PlayerBadges presence={presence} myClientId={identity.clientId} />
            </>
          )
        }
      />

      {status === "ready" && isVersus && myTeam && raceProgress && (
        <RaceBar
          race={race}
          progress={raceProgress}
          myTeam={myTeam}
          onStart={() => startRace(roomId)}
        />
      )}

      <main className="relative flex-1">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" />}

        {showTeamPicker && <TeamPicker presence={presence} onPick={chooseTeam} />}

        {status === "loading" && <RoomLoading text="Preparando el rompecabezas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message={errorMsg} />}

        {!isVersus && (
          <CompletionBanner show={progress.total > 0 && progress.placed === progress.total} />
        )}

        {showBoard && (
          <PuzzleStage
            roomId={roomId}
            layout={layout!}
            image={image!}
            pieceBitmaps={pieceBitmaps!}
            pieces={pieces}
            clientId={identity.clientId}
            presence={presence}
            teamId={isVersus ? myTeam ?? undefined : undefined}
            locked={isVersus && race.status !== "racing"}
          />
        )}
      </main>
    </div>
  );
}
