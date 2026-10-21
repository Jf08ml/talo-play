"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";

export default function ImageDropzone({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = useCallback(
    (f: File | null) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(f ? URL.createObjectURL(f) : null);
      onChange(f);
    },
    [onChange, previewUrl]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={previewUrl ? "Cambiar la imagen" : "Elegir una imagen"}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
        dragOver
          ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
      } ${previewUrl ? "p-2" : "p-6"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Vista previa"
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">
            <ImagePlus className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-slate-200">Elegí una foto</p>
          <p className="text-xs text-slate-500">
            Tocá para buscarla en la galería<span className="hidden sm:inline"> o arrastrala acá</span>
          </p>
        </div>
      )}
      {file && (
        <p className="mt-2 flex max-w-full items-center gap-1.5 truncate text-xs text-slate-500">
          <RefreshCw className="h-3 w-3 shrink-0" /> Tocá para cambiarla
        </p>
      )}
    </div>
  );
}
