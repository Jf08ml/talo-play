"use client";

import { memo, useEffect, useRef } from "react";
import { Image as KonvaImage } from "react-konva";
import Konva from "konva";
import type { PieceState } from "@/lib/room";

export interface PuzzlePieceProps {
  pieceId: string;
  bitmapCanvas: HTMLCanvasElement;
  bleed: number;
  state: PieceState;
  draggable: boolean;
  heldColor: string | null;
  onDragStart: (pieceId: string, node: Konva.Node) => void;
  onDragMove: (pieceId: string, node: Konva.Node) => void;
  onDragEnd: (pieceId: string, node: Konva.Node) => void;
}

function setCursor(target: Konva.Node, cursor: string) {
  const stage = target.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

function PuzzlePieceImpl({
  pieceId,
  bitmapCanvas,
  bleed,
  state,
  draggable,
  heldColor,
  onDragStart,
  onDragMove,
  onDragEnd,
}: PuzzlePieceProps) {
  const nodeRef = useRef<Konva.Image>(null);
  const wasPlaced = useRef(state.placed);

  // A quick scale-and-glow "pop" the instant a piece snaps into place — pure
  // feedback, so it only ever touches scale/shadow and never x/y (those stay
  // exactly what the drag math above already computed).
  useEffect(() => {
    const justPlaced = state.placed && !wasPlaced.current;
    wasPlaced.current = state.placed;
    const node = nodeRef.current;
    if (!justPlaced || !node) return;

    node.scale({ x: 1, y: 1 });
    node.shadowColor("#34d399");
    node.shadowOpacity(0.9);
    node.shadowBlur(0);
    new Konva.Tween({
      node,
      duration: 0.16,
      scaleX: 1.08,
      scaleY: 1.08,
      shadowBlur: 22,
      easing: Konva.Easings.EaseOut,
      onFinish: () => {
        new Konva.Tween({
          node,
          duration: 0.18,
          scaleX: 1,
          scaleY: 1,
          shadowBlur: 0,
          easing: Konva.Easings.EaseIn,
        }).play();
      },
    }).play();
  }, [state.placed]);

  return (
    <KonvaImage
      ref={nodeRef}
      image={bitmapCanvas}
      x={state.x - bleed}
      y={state.y - bleed}
      draggable={draggable}
      onMouseEnter={(e) => draggable && setCursor(e.target, "grab")}
      onMouseLeave={(e) => setCursor(e.target, "default")}
      onDragStart={(e) => {
        setCursor(e.target, "grabbing");
        onDragStart(pieceId, e.target);
      }}
      onDragMove={(e) => onDragMove(pieceId, e.target)}
      onDragEnd={(e) => {
        setCursor(e.target, "default");
        onDragEnd(pieceId, e.target);
      }}
      shadowColor={heldColor ?? "#c084fc"}
      shadowBlur={heldColor ? 16 : state.placed ? 0 : 6}
      shadowOpacity={heldColor ? 0.95 : state.placed ? 0 : 0.45}
      shadowOffset={{ x: 0, y: 0 }}
      perfectDrawEnabled={false}
    />
  );
}

export default memo(PuzzlePieceImpl);
