"use client";

import { useEffect, useRef, useState } from "react";
import type { Cake } from "@/lib/bakery";
import type { Quality } from "@/lib/postfx";
import type { BakeryScene } from "@/lib/bakery3d";
import CakeArt from "./CakeArt";

/** Whether this browser can draw WebGL (checked on a throwaway canvas). */
function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** A one-off effect on the cake: each new object plays once. */
export interface CakeFx {
  kind: "celebrate" | "wrong" | "";
}

/**
 * The 3D cake on its stand. Drag (mouse or finger) to turn it. Without
 * WebGL (or if the scene fails) it falls back to the 2D cake, so the game
 * stays playable.
 */
export default function CakeStage({
  cake,
  quality,
  paused,
  fx,
  reducedMotion,
}: {
  cake: Cake;
  quality: Quality;
  paused: boolean;
  fx: CakeFx;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BakeryScene | null>(null);
  const cakeRef = useRef(cake);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);

  useEffect(() => {
    cakeRef.current = cake;
    sceneRef.current?.setCake(cake);
  }, [cake]);

  // The scene lives as long as the quality: switching it rebuilds the renderer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- known only in the browser, once.
      setFailed(true);
      return;
    }
    let disposed = false;
    let scene: BakeryScene | null = null;
    import("@/lib/bakery3d")
      .then(({ BakeryScene }) => {
        if (disposed) return;
        scene = new BakeryScene(canvas, { quality, reducedMotion });
        scene.setCake(cakeRef.current);
        sceneRef.current = scene;
      })
      .catch((err) => {
        console.warn("La pastelería 3D no está disponible; se muestra en 2D.", err);
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [quality, reducedMotion]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    if (fx.kind === "celebrate") sceneRef.current?.celebrate();
    if (fx.kind === "wrong") sceneRef.current?.wrong();
  }, [fx]);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-pink-100 via-violet-100 to-amber-50 p-4">
        <CakeArt cake={cake} className="h-full max-h-80 w-full" label="Tu torta" />
        <p className="text-xs text-violet-700">Tu dispositivo no muestra 3D: jugás con la torta dibujada.</p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none select-none"
      aria-label="Tu torta en 3D. Arrastrá para girarla."
      role="img"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        sceneRef.current?.setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current || drag.current.id !== e.pointerId) return;
        sceneRef.current?.drag(e.clientX - drag.current.x);
        drag.current.x = e.clientX;
      }}
      onPointerUp={() => {
        drag.current = null;
        sceneRef.current?.setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        sceneRef.current?.setDragging(false);
      }}
    />
  );
}
