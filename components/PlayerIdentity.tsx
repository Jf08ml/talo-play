"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { ClientIdentity } from "@/hooks/useClientIdentity";
import { Pencil } from "lucide-react";
import NamePrompt from "./NamePrompt";

/**
 * Shows "Jugando como …" with a way to change it. With `requireName` (lobby
 * pages, i.e. once you're about to play) it also asks for a name when there
 * is none; the home page leaves it off so a first visit isn't a form.
 * `compact` is the small chip for the site header (tap it to change).
 */
export default function PlayerIdentity({
  identity,
  requireName = true,
  compact = false,
}: {
  identity: ClientIdentity;
  requireName?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  // clientId is "" during SSR / before hydration; render nothing until then.
  if (!identity.clientId) return null;

  if (!identity.name) {
    // Portaled: the site header has a backdrop blur, which would trap a fixed modal inside it.
    return requireName ? createPortal(<NamePrompt onSubmit={identity.setName} />, document.body) : null;
  }

  return (
    <>
      {compact ? (
        <button
          onClick={() => setEditing(true)}
          title="Cambiar tu nombre"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 text-sm transition hover:border-white/20 hover:bg-white/[0.06]"
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: identity.color }}
          >
            {identity.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[8rem] truncate font-medium text-slate-200">{identity.name}</span>
          <Pencil className="h-3 w-3 text-slate-500" />
        </button>
      ) : (
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 text-sm">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: identity.color }}
          >
            {identity.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-slate-400">
            Jugando como <span className="font-medium text-slate-100">{identity.name}</span>
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-100 hover:underline"
          >
            cambiar
          </button>
        </div>
      )}

      {editing &&
        createPortal(
          <NamePrompt
            initialValue={identity.name}
            submitLabel="Guardar"
            onCancel={() => setEditing(false)}
            onSubmit={(name) => {
              identity.setName(name);
              setEditing(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}
