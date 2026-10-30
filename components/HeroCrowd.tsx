"use client";

import { useEffect, useRef, useState } from "react";
import { Talo, lookToward } from "./Talo";

// The home hero's six talos standing on its bottom edge (talo-handoff
// Main.dc.html), laid out in a 640×420 box: x from the left, y from the bottom.
const CROWD = [
  { x: 200, y: 0, w: 150, h: 310, color: "#2D5BFF", radius: "75px 75px 20px 20px", blink: "1.2s", z: 1 },
  { x: 350, y: 0, w: 170, h: 170, color: "#00B26B", radius: "30px", blink: "3.1s", z: 1 },
  { x: 10, y: 0, w: 210, h: 210, color: "#FF5FA2", radius: "50%", blink: "0s", z: 2 },
  { x: 480, y: 0, w: 160, h: 104, color: "#FF7A1A", radius: "80px 80px 14px 14px", blink: "4.4s", z: 2 },
  { x: 395, y: 170, w: 84, h: 84, color: "#8A4DFF", radius: "50%", blink: "2.2s", z: 1 },
  { x: 168, y: 0, w: 76, h: 96, color: "#111111", radius: "38px 38px 12px 12px", blink: "5s", z: 3 },
];

// With no pointer over the hero they look at the headline (left and up).
const AT_HEADLINE: [number, number] = [-0.95, -0.3];

/**
 * The crowd. While the cursor is over the hero (the closest <section>), their
 * pupils follow it; when it leaves, they look back at the headline. Nothing
 * follows anything when reduced motion is asked.
 */
export default function HeroCrowd({ className = "" }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [looks, setLooks] = useState<[number, number][] | null>(null);

  useEffect(() => {
    const hero = box.current?.closest("section");
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setLooks(
          refs.current.map((el) => {
            if (!el) return AT_HEADLINE;
            const r = el.getBoundingClientRect();
            // The eyes sit about a third of the way down the body's shorter side.
            const eye = { x: r.left + r.width / 2, y: r.top + Math.min(r.width, r.height) * 0.36 };
            return lookToward(eye, { x: e.clientX, y: e.clientY });
          })
        )
      );
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      setLooks(null);
    };
    hero.addEventListener("mousemove", move);
    hero.addEventListener("mouseleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      hero.removeEventListener("mousemove", move);
      hero.removeEventListener("mouseleave", leave);
    };
  }, []);

  return (
    <div ref={box} aria-hidden="true" className={`relative h-[420px] w-[640px] ${className}`}>
      {CROWD.map((t, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute"
          style={{ left: t.x, bottom: t.y, zIndex: t.z }}
        >
          <Talo w={t.w} h={t.h} color={t.color} radius={t.radius} blinkDelay={t.blink} look={looks?.[i] ?? AT_HEADLINE} />
        </span>
      ))}
    </div>
  );
}
