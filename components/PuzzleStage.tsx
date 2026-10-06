"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva";
import type Konva from "konva";
import type { PuzzleLayout } from "@/lib/puzzleGeometry";
import type { PieceBitmap } from "@/lib/piecesRender";
import { holdPiece, releasePiece, updatePiece, type PieceState, type TeamId } from "@/lib/room";
import type { PresenceMap } from "@/lib/presence";
import { useElementSize } from "@/hooks/useElementSize";
import PuzzlePiece from "./PuzzlePiece";

const SNAP_DISTANCE = 26;
const DRAG_UPDATE_INTERVAL_MS = 45;
// How long to trust a just-released piece's local position over the
// `pieces` prop, so we don't flash back to the pre-drop spot while our own
// write is still echoing down through Firebase.
const OVERRIDE_GRACE_MS = 800;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const BUTTON_ZOOM_STEP = 1.3;

type TouchPoint = { x: number; y: number };

function touchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function touchCenter(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Small stroke-based toolbar icons (Feather-style), so the zoom/fullscreen
// controls render crisply everywhere instead of relying on unicode glyphs
// (⤢ ⛶ ⤦ …) that some platforms/fonts show as blank boxes.
function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <IconBase>
      <circle cx={11} cy={11} r={7} />
      <line x1={11} y1={8} x2={11} y2={14} />
      <line x1={8} y1={11} x2={14} y2={11} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </IconBase>
  );
}

function ZoomOutIcon() {
  return (
    <IconBase>
      <circle cx={11} cy={11} r={7} />
      <line x1={8} y1={11} x2={14} y2={11} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </IconBase>
  );
}

function RecenterIcon() {
  return (
    <IconBase>
      <circle cx={12} cy={12} r={3} />
      <line x1={12} y1={2} x2={12} y2={6} />
      <line x1={12} y1={18} x2={12} y2={22} />
      <line x1={2} y1={12} x2={6} y2={12} />
      <line x1={18} y1={12} x2={22} y2={12} />
    </IconBase>
  );
}

function MaximizeIcon() {
  return (
    <IconBase>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </IconBase>
  );
}

function MinimizeIcon() {
  return (
    <IconBase>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M16 3v3a2 2 0 0 0 2 2h3" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    </IconBase>
  );
}

export default function PuzzleStage({
  roomId,
  layout,
  image,
  pieceBitmaps,
  pieces,
  clientId,
  presence,
  teamId,
  locked = false,
}: {
  roomId: string;
  layout: PuzzleLayout;
  image: HTMLImageElement;
  pieceBitmaps: Map<string, PieceBitmap>;
  pieces: Record<string, PieceState>;
  clientId: string;
  presence: PresenceMap;
  /** When set, this room is in versus mode and this client plays for this team. */
  teamId?: TeamId;
  /** Forces every piece non-draggable (used while a race hasn't started yet, or already finished). */
  locked?: boolean;
}) {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const lastSentAt = useRef<Record<string, number>>({});
  const releaseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const centered = useRef(false);
  const pinch = useRef<{ dist: number; center: TouchPoint } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Live positions for pieces this client is dragging (or just released, for
  // a short grace period) — set only from event handlers, never from an
  // effect, so it never fights the Firebase-driven `pieces` prop mid-drag.
  const [pieceOverrides, setPieceOverrides] = useState<Record<string, PieceState>>({});

  const effectivePieces = useMemo(() => {
    const overrideIds = Object.keys(pieceOverrides);
    if (overrideIds.length === 0) return pieces;
    return { ...pieces, ...pieceOverrides };
  }, [pieces, pieceOverrides]);

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !size.width || !size.height) return;
    const boardW = layout.cellW * layout.cols;
    const scale = Math.min(1, (size.width * 0.85) / boardW);
    stage.scale({ x: scale, y: scale });
    stage.position({ x: (size.width - boardW * scale) / 2, y: 24 });
    stage.batchDraw();
  }, [size, layout]);

  useEffect(() => {
    if (!size.width || !size.height || centered.current) return;
    fitToScreen();
    centered.current = true;
  }, [size, fitToScreen]);

  // Cancel any pending grace-period timers on unmount.
  useEffect(() => {
    const timers = releaseTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Track fullscreen state (also flips back when the user hits Esc, not just our button).
  // Entering/exiting fullscreen resizes the container drastically, so the old
  // scale/position (computed for the previous size) would leave the board
  // stranded off-screen — clearing `centered` makes the size-change effect
  // above re-run `fitToScreen()` once the container settles into its new size.
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      centered.current = false;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, [containerRef]);

  const zoomByFactor = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    const pointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor));
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - pointTo.x * newScale,
      y: center.y - pointTo.y * newScale,
    });
    stage.batchDraw();
  }, []);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const scaleBy = 1.06;
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy)
    );
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
    stage.batchDraw();
  }, []);

  // Two-finger pinch to zoom on touch devices (mirrors the wheel-zoom math
  // above, but tracks the delta between successive touchmove events since
  // touch has no "wheel notch" — each frame we only know the two fingers'
  // current positions, not how far they've moved since the gesture started).
  //
  // Konva's own pointermove handling stops delivering *any* touchmove events
  // once it decides a native drag is in progress (Stage has `draggable`, for
  // single-finger panning) — so a second finger landing mid-drag would go
  // completely unseen here unless we turn `draggable` off the instant a
  // second touch appears, before Konva's drag-start threshold ever fires.
  const handleTouchStart = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) return;
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.isDragging()) stage.stopDrag();
    stage.draggable(false);
  }, []);

  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.container().getBoundingClientRect();
    const p1: TouchPoint = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const p2: TouchPoint = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    const dist = touchDistance(p1, p2);
    const center = touchCenter(p1, p2);

    const prev = pinch.current;
    if (!prev) {
      pinch.current = { dist, center };
      return;
    }

    const oldScale = stage.scaleX();
    const pointTo = {
      x: (prev.center.x - stage.x()) / oldScale,
      y: (prev.center.y - stage.y()) / oldScale,
    };
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * (dist / prev.dist)));
    const dx = center.x - prev.center.x;
    const dy = center.y - prev.center.y;
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - pointTo.x * newScale + dx,
      y: center.y - pointTo.y * newScale + dy,
    });
    stage.batchDraw();
    pinch.current = { dist, center };
  }, []);

  const handleTouchEnd = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length >= 2) return;
    pinch.current = null;
    stageRef.current?.draggable(true);
  }, []);

  const handleDragStart = useCallback(
    (pieceId: string, node: Konva.Node) => {
      clearTimeout(releaseTimers.current[pieceId]);
      delete releaseTimers.current[pieceId];
      const bleed = layout.bleed;
      const x = node.x() + bleed;
      const y = node.y() + bleed;
      setPieceOverrides((prev) => ({
        ...prev,
        [pieceId]: { x, y, placed: false, holder: clientId },
      }));
      holdPiece(roomId, pieceId, clientId, teamId).catch(() => {});
    },
    [roomId, clientId, layout.bleed, teamId]
  );

  const handleDragMove = useCallback(
    (pieceId: string, node: Konva.Node) => {
      const now = performance.now();
      const last = lastSentAt.current[pieceId] ?? 0;
      if (now - last < DRAG_UPDATE_INTERVAL_MS) return;
      lastSentAt.current[pieceId] = now;

      const bleed = layout.bleed;
      const x = node.x() + bleed;
      const y = node.y() + bleed;
      setPieceOverrides((prev) => ({
        ...prev,
        [pieceId]: { x, y, placed: false, holder: clientId },
      }));
      updatePiece(roomId, pieceId, { x, y }, teamId).catch(() => {});
    },
    [layout.bleed, roomId, clientId, teamId]
  );

  const handleDragEnd = useCallback(
    (pieceId: string, node: Konva.Node) => {
      const piece = layout.pieces.find((p) => p.id === pieceId);
      if (!piece) return;
      const bleed = layout.bleed;
      let x = node.x() + bleed;
      let y = node.y() + bleed;
      const dist = Math.hypot(x - piece.correctX, y - piece.correctY);
      let placed = false;
      if (dist < SNAP_DISTANCE) {
        x = piece.correctX;
        y = piece.correctY;
        placed = true;
        node.position({ x: x - bleed, y: y - bleed });
      }

      const finalState: PieceState = { x, y, placed, holder: null };
      setPieceOverrides((prev) => ({ ...prev, [pieceId]: finalState }));
      releasePiece(roomId, pieceId, finalState, teamId).catch(() => {});

      clearTimeout(releaseTimers.current[pieceId]);
      releaseTimers.current[pieceId] = setTimeout(() => {
        delete releaseTimers.current[pieceId];
        setPieceOverrides((prev) => {
          if (!(pieceId in prev)) return prev;
          const next = { ...prev };
          delete next[pieceId];
          return next;
        });
      }, OVERRIDE_GRACE_MS);
    },
    [roomId, layout, teamId]
  );

  const orderedPieces = layout.pieces.slice().sort((a, b) => {
    const aActive = a.id in pieceOverrides;
    const bActive = b.id in pieceOverrides;
    if (aActive !== bActive) return aActive ? 1 : -1;
    const aPlaced = effectivePieces[a.id]?.placed ?? false;
    const bPlaced = effectivePieces[b.id]?.placed ?? false;
    if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
    return 0;
  });

  const boardW = layout.cellW * layout.cols;
  const boardH = layout.cellH * layout.rows;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-slate-950"
    >
      <Stage
        ref={stageRef}
        width={size.width || 1}
        height={size.height || 1}
        draggable
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Layer listening={false}>
          <Rect
            x={0}
            y={0}
            width={boardW}
            height={boardH}
            fill="#0f172a"
            stroke="#a855f7"
            strokeWidth={2}
            dash={[10, 6]}
            shadowColor="#a855f7"
            shadowBlur={24}
            shadowOpacity={0.35}
          />
          <KonvaImage image={image} x={0} y={0} width={boardW} height={boardH} opacity={0.22} />
        </Layer>
        <Layer>
          {orderedPieces.map((piece) => {
            const bitmap = pieceBitmaps.get(piece.id);
            const state = effectivePieces[piece.id];
            if (!bitmap || !state) return null;
            const heldByOther = Boolean(state.holder && state.holder !== clientId);
            const draggable =
              !locked && !state.placed && (!state.holder || state.holder === clientId);
            return (
              <PuzzlePiece
                key={piece.id}
                pieceId={piece.id}
                bitmapCanvas={bitmap.canvas}
                bleed={layout.bleed}
                state={state}
                draggable={draggable}
                heldColor={heldByOther ? presence[state.holder!]?.color ?? "#0ea5e9" : null}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </Layer>
      </Stage>
      <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full border border-violet-500/20 bg-slate-900/90 px-3 py-1 text-xs text-slate-300 shadow-[0_0_15px_rgba(139,92,246,0.15)] sm:block">
        Rueda del mouse o pellizcá para hacer zoom · Arrastrá el fondo para mover la vista
      </div>

      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => zoomByFactor(BUTTON_ZOOM_STEP)}
          aria-label="Acercar"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-500/20 bg-slate-900/90 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:bg-slate-800 hover:text-violet-200 active:scale-95"
        >
          <ZoomInIcon />
        </button>
        <button
          type="button"
          onClick={() => zoomByFactor(1 / BUTTON_ZOOM_STEP)}
          aria-label="Alejar"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-500/20 bg-slate-900/90 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:bg-slate-800 hover:text-violet-200 active:scale-95"
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          onClick={fitToScreen}
          aria-label="Ajustar a la pantalla"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-500/20 bg-slate-900/90 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:bg-slate-800 hover:text-violet-200 active:scale-95"
        >
          <RecenterIcon />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-400/25 bg-slate-900/90 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:bg-slate-800 hover:text-cyan-200 active:scale-95"
        >
          {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
      </div>
    </div>
  );
}
