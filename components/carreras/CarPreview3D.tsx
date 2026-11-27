"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { disposeCar, previewCar, type CarLook } from "@/lib/carreras3d";
import { carModelsReady, loadCarModels } from "@/lib/carreras3dModels";

/** The «Tu auto» car in 3D: turning slowly, drag to turn it yourself. */
export default function CarPreview3D({ look, className = "" }: { look: CarLook; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(look);
  // The modeled bodies: the drawn car until they load, then rebuilt with them.
  const [modeled, setModeled] = useState(carModelsReady);
  useEffect(() => {
    let alive = true;
    loadCarModels().then((ok) => alive && ok && setModeled(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      host.querySelector("[data-preview-fallback]")?.classList.remove("hidden");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a3030, 2.4));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(-40, 80, 60);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    camera.position.set(52, 30, 62);
    camera.lookAt(0, 4, 0);

    // A dark disc under it, so the neon (additive) shows like it does on the road.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x202635 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const pivot = new THREE.Group();
    scene.add(pivot);
    const car = previewCar(JSON.parse(key) as CarLook);
    pivot.add(car);

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

    let yaw = 0.6;
    let dragging = false;
    let lastX = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
    };
    const up = () => (dragging = false);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    let frame = 0;
    let previous = 0;
    const draw = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (!dragging) yaw += dt * 0.35;
      pivot.rotation.y = yaw;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      disposeCar(car);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [key, modeled]);

  return (
    <div ref={hostRef} className={`relative overflow-hidden rounded-2xl bg-slate-900 ${className}`}>
      <canvas aria-label="Vista 3D de tu auto; arrastra para girarlo" className="h-full w-full touch-pan-y" />
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/70">Arrastra para girar</span>
      <span data-preview-fallback className="absolute inset-0 hidden flex items-center justify-center bg-slate-900/90 p-4 text-center text-xs text-slate-300">
        No se pudo mostrar el auto en este dispositivo.
      </span>
    </div>
  );
}
