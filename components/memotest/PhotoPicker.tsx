"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

/** Picks several images (one per pair) with thumbnails; files can be removed individually. */
export default function PhotoPicker({
  files,
  onChange,
  max,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    onChange([...files, ...images].slice(0, max));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
          dragOver
            ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-slate-300">
          Arrastrá fotos acá, o hacé clic para elegirlas
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Una por par · se recortan en cuadrado · {files.length}/{max}
        </p>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-6 gap-1.5">
          {previews.map((url, i) => (
            <div key={url} className="group relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full rounded-md object-cover" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label="Quitar foto"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-slate-300 ring-1 ring-slate-600 hover:bg-red-500 hover:text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
