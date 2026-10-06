import { buildPiecePath, type PuzzleLayout } from "./puzzleGeometry";

export interface PieceBitmap {
  id: string;
  canvas: HTMLCanvasElement;
  /** Distance from the piece's correct top-left cell corner to the bitmap's top-left corner. */
  bleed: number;
}

/**
 * Pre-renders each piece as its own small canvas: the source image clipped
 * to the piece's jigsaw outline (with a subtle edge stroke), so dragging a
 * piece at runtime is just blitting a bitmap instead of re-clipping the full
 * image every frame.
 */
export function renderPieceBitmaps(
  image: CanvasImageSource,
  layout: PuzzleLayout
): Map<string, PieceBitmap> {
  const { cellW, cellH, knob, bleed } = layout;
  const map = new Map<string, PieceBitmap>();

  for (const piece of layout.pieces) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(cellW + bleed * 2);
    canvas.height = Math.ceil(cellH + bleed * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    const path = new Path2D(buildPiecePath(cellW, cellH, knob, piece.edges));

    ctx.save();
    ctx.translate(bleed, bleed);
    ctx.clip(path);
    ctx.drawImage(image, -piece.correctX, -piece.correctY);
    ctx.restore();

    ctx.save();
    ctx.translate(bleed, bleed);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke(path);
    ctx.restore();

    map.set(piece.id, { id: piece.id, canvas, bleed });
  }

  return map;
}
