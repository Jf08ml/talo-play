"use client";

import { useState } from "react";
import type { ClientIdentity } from "@/hooks/useClientIdentity";
import NamePrompt from "./NamePrompt";

/**
 * Salón-wide identity gate for lobby pages: asks for a name when there is none
 * and otherwise shows "Jugando como …" with a way to change it.
 */
export default function PlayerIdentity({ identity }: { identity: ClientIdentity }) {
  const [editing, setEditing] = useState(false);

  // clientId is "" during SSR / before hydration; render nothing until then.
  if (!identity.clientId) return null;

  if (!identity.name) {
    return <NamePrompt onSubmit={identity.setName} />;
  }

  return (
    <>
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-violet-500/20 bg-slate-900/70 py-1 pl-1 pr-3 text-sm backdrop-blur">
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
          className="text-xs text-violet-400 hover:text-violet-300"
        >
          cambiar
        </button>
      </div>

      {editing && (
        <NamePrompt
          initialValue={identity.name}
          submitLabel="Guardar"
          onCancel={() => setEditing(false)}
          onSubmit={(name) => {
            identity.setName(name);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
