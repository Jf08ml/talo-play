"use client";

import { SIZES, createDeslizRoom, updateDeslizSettings } from "@/lib/deslizante";
import ImageDropzone from "@/components/ImageDropzone";
import type { GameSettings } from "@/components/RoomSettings";

type Settings = {
  /** A new image (when editing, null keeps the room's). */
  file: File | null;
  imageUrl: string;
  size: number;
  showNumbers: boolean;
};

export const SETTINGS: GameSettings<Settings> = {
  game: "deslizante",
  initial: { file: null, imageUrl: "", size: 4, showNumbers: true },
  fields: [
    {
      kind: "custom",
      render: (v, set, editing) => (
        <div className="flex flex-col gap-2">
          {editing && !v.file && v.imageUrl && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.imageUrl} alt="Imagen actual" className="h-14 w-14 rounded-lg object-cover" />
              Esta es la imagen actual. Si elegís otra, la reemplaza.
            </div>
          )}
          <ImageDropzone file={v.file} onChange={(file) => set({ file })} />
        </div>
      ),
    },
    {
      kind: "choice",
      key: "size",
      label: "Tamaño",
      options: SIZES.map((s) => ({ value: s.size, label: s.label, sub: `${s.size}×${s.size}` })),
    },
    { kind: "toggle", key: "showNumbers", label: "Mostrar números en las fichas", hint: "Ayuda a saber dónde va cada una." },
  ],
  problem: (v) => (!v.file && !v.imageUrl ? "Elegí una imagen." : null),
  create: (v, hostId) => createDeslizRoom({ file: v.file!, size: v.size, showNumbers: v.showNumbers }, hostId),
  save: (roomId, v) => updateDeslizSettings(roomId, { file: v.file, size: v.size, showNumbers: v.showNumbers }),
  fromMeta: (meta) => ({ file: null, imageUrl: meta.imageUrl ?? "", size: meta.size ?? 4, showNumbers: meta.showNumbers ?? true }),
};
