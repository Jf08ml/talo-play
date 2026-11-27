"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TEAM_COLORS, disposeTree, type KnightLook } from "@/lib/arena3dKnight";
import { PART, cloneKnightModel, knightAnimations, loadKnightModel, updateEyes, type Eyes } from "@/lib/arena3dModel";
import { EMBLEM_PATHS } from "@/lib/arenaLooks";
import type { TeamId } from "@/lib/teams";

/** The knight's height with its plume on (helmet dome 1.81 m + plume), for the framing. */
const KNIGHT_HEIGHT = 2.15;
const EMBLEM_COLORS: Record<string, number> = { ninguno: 0xf8fafc, cruz: 0xf5f0dc, estrella: 0xffd34f, rayo: 0x8cecff, luna: 0xc4a7ff, corona: 0xffcc55, dragon: 0xff694f, calavera: 0xf4f4f5 };

/** Preview of the exported, rigged Talo knight GLB. */
export default function KnightPreview3D({ look, team, className = "" }: { look: KnightLook; team: TeamId; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { armor, cape, emblem, helm, plume } = look;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      canvas.classList.add("hidden");
      host.querySelector("[data-preview-fallback]")?.classList.remove("hidden");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    camera.position.set(2.9, 2.25, 4.5);
    camera.lookAt(0, 1.05, 0);
    scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x392b2b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 3.1);
    keyLight.position.set(-3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8eb8ff, 1.4);
    rimLight.position.set(3, 2, -4);
    scene.add(rimLight);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.88, 48), new THREE.MeshLambertMaterial({ color: 0x202635 }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.015;
    scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.018, 8, 56), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team] }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.025;
    scene.add(ring);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    let width = 0;
    let height = 0;
    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      if (w === width && h === height) return;
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let model: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let eyes: Eyes | null = null;
    let disposed = false;
    let failed = false;
    // The same loaded knight and dressing as the battle (lib/arena3dModel.ts),
    // keeping the model's own sword and shield here.
    void loadKnightModel().then((ok) => {
      if (disposed) return;
      const made = ok ? cloneKnightModel({ armor, tint: TEAM_COLORS[team], plume, helm, cape, keepGear: true }) : null;
      if (!made) {
        failed = true;
        host.querySelector("[data-preview-fallback]")?.classList.remove("hidden");
        return;
      }
      model = made.root;
      eyes = made.eyes;
      const shieldSymbol = model.getObjectByName(PART.shieldEmblem) as THREE.Mesh | undefined;
      if (shieldSymbol) shieldSymbol.visible = false;
      const emblemPath = EMBLEM_PATHS[emblem];
      if (shieldSymbol && emblemPath && shieldSymbol.parent) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d");
        if (context) {
          const emblemColor = new THREE.Color(EMBLEM_COLORS[emblem] ?? EMBLEM_COLORS.ninguno).getStyle();
          context.fillStyle = emblemColor;
          context.fill(new Path2D(emblemPath), "evenodd");
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          decal.position.set(0, 0.013, 0.199);
          decal.renderOrder = 2;
          shieldSymbol.parent.add(decal);
        }
      }
      // Fitted to the knight with its plume (~2.15 m tall), so it keeps its size across helms.
      const fit = 2.12 / KNIGHT_HEIGHT;
      pivot.scale.setScalar(fit);
      pivot.add(model);
      const clips = knightAnimations();
      if (clips.length) {
        mixer = new THREE.AnimationMixer(model);
        const idle = clips.find((clip) => /reposo|idle/i.test(clip.name)) ?? clips[0];
        mixer.clipAction(idle).play();
      }
    });

    let baseYaw = 0.08;
    let dragging = false;
    let lastX = 0;
    const down = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      baseYaw += (event.clientX - lastX) * 0.009;
      lastX = event.clientX;
      pivot.rotation.y = baseYaw;
    };
    const up = () => { dragging = false; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    let frame = 0;
    let previous = 0;
    const draw = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      const t = now / 1000;
      if (!dragging) pivot.rotation.y = baseYaw + Math.sin(t * 0.55) * 0.12;
      if (mixer) mixer.update(dt);
      // Blinks and looks around a little.
      if (eyes) updateEyes(eyes, { ko: false, open: 1, lookX: Math.sin(t * 0.45) * 0.6, lookY: Math.sin(t * 0.3) * 0.25 }, dt, t);
      pivot.position.y = model && !failed ? 0.012 * Math.sin(t * 1.8) : 0;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      mixer?.stopAllAction();
      if (model) disposeTree(model);
      base.geometry.dispose();
      (base.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [armor, cape, emblem, helm, plume, team]);

  return (
    <div ref={hostRef} className={`relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 ${className}`}>
      <canvas aria-label={`Vista 3D del caballero del equipo ${team === "red" ? "rojo" : "azul"}; arrastra para girarlo`} className="h-full w-full touch-pan-y" />
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/70">Arrastra para girar</span>
      <span data-preview-fallback className="absolute inset-0 hidden flex items-center justify-center bg-slate-900/90 p-4 text-center text-xs text-slate-300">No se pudo cargar el modelo 3D en este dispositivo.</span>
    </div>
  );
}
