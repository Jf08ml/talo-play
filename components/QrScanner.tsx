"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ScanQrCode, X } from "lucide-react";
import { qrTarget } from "@/lib/qrTarget";

/**
 * «Escanear QR»: opens the back camera and, when it reads a room's QR (the
 * one big screens show, or an invite's), goes there. Reads with the
 * browser's own BarcodeDetector where there is one (Chrome on Android) and
 * with jsQR otherwise (iPhone, computers), loaded only when the camera opens.
 */
export default function ScanQrButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // Stable, or the camera would restart whenever the page re-renders.
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <ScanQrCode className="h-[18px] w-[18px]" strokeWidth={2.4} /> Escanear QR
      </button>
      {open && createPortal(<Scanner onClose={close} />, document.body)}
    </>
  );
}

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorClass {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** The fastest reader this browser has. */
async function makeDetector(): Promise<Detect> {
  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const det = new Native({ formats: ["qr_code"] });
        return async (video) => (await det.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Falls back to jsQR.
    }
  }
  const jsQR = (await import("jsqr")).default;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    // Smaller frames read faster and a QR held up to the camera stays big enough.
    const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * k);
    const h = Math.round(video.videoHeight * k);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    return found?.data ?? null;
  };
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Necesitamos permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No encontramos una cámara en este dispositivo.";
  if (name === "NotReadableError") return "La cámara está ocupada por otra app. Ciérrala y vuelve a intentarlo.";
  return "No pudimos abrir la cámara.";
}

function Scanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia ? "Este navegador no deja usar la cámara aquí. Escribe el código de la sala." : null
  );
  const [notOurs, setNotOurs] = useState(false);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (error) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hideNotOurs: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        if (!stopped) setError(cameraError(e));
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const detect = await makeDetector();
      const tick = async () => {
        if (stopped) return;
        let text: string | null = null;
        try {
          text = await detect(video);
        } catch {
          text = null;
        }
        if (stopped) return;
        if (text) {
          const to = qrTarget(text, window.location.host);
          if (to) {
            stopped = true;
            navigator.vibrate?.(40);
            stream?.getTracks().forEach((t) => t.stop());
            onClose();
            router.push(to);
            return;
          }
          setNotOurs(true);
          if (hideNotOurs) clearTimeout(hideNotOurs);
          hideNotOurs = setTimeout(() => setNotOurs(false), 2200);
        }
        timer = setTimeout(tick, 140);
      };
      tick();
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (hideNotOurs) clearTimeout(hideNotOurs);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [error, onClose, router]);

  return (
    <div role="dialog" aria-label="Escanear el QR de una sala" className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full bg-black/60 hover:bg-black/80"
      >
        <X className="h-6 w-6" />
      </button>
      {error ? (
        <div className="relative m-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
          <ScanQrCode className="h-12 w-12 text-talo-hero" />
          <p className="text-base font-bold">{error}</p>
          <button type="button" onClick={onClose} className="rounded-xl bg-talo-hero px-5 py-3 font-bold text-talo-ink">
            Volver
          </button>
        </div>
      ) : (
        <div className="pointer-events-none relative m-auto flex flex-col items-center gap-5">
          {/* The frame to aim at: the camera shows through, the rest dimmed. */}
          <div className="h-[min(68vw,300px)] w-[min(68vw,300px)] rounded-[28px] border-4 border-talo-hero shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]" />
          <p className="rounded-full bg-black/60 px-4 py-2 text-center text-sm font-bold">
            {notOurs ? "Ese QR no es de una sala de Talo" : "Apunta al QR de la sala"}
          </p>
        </div>
      )}
    </div>
  );
}
