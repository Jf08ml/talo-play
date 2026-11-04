"use client";

import { degrees, type Puzzle } from "@/lib/puentes";
import Board from "./Board";

/** After a map: the route that worked, or why there was none. */
export default function Reveal({ pz }: { pz: Puzzle }) {
  const odd = degrees(pz).filter((d) => d % 2).length;
  return (
    <div className="flex flex-col gap-2">
      <Board pz={pz} play={null} reveal={pz.impossible ? "odd" : "solution"} />
      <p className="text-center text-xs leading-snug text-white/70">
        {pz.impossible
          ? `No tenía solución: ${odd} islas tienen una cantidad impar de puentes (en rojo). Un recorrido así solo existe si hay 0 o 2.`
          : "Una forma de hacerlo: seguí los números en orden."}
      </p>
    </div>
  );
}
