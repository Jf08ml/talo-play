"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";

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
      onClick={() => inputRef.current?.click()}
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
        <>
          <p className="text-sm font-medium text-slate-300">
            Arrastrá una imagen acá, o hacé clic para elegirla
          </p>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG o WEBP</p>
        </>
      )}
      {file && (
        <p className="mt-2 truncate text-xs text-slate-500">{file.name}</p>
      )}
    </div>
  );
}
