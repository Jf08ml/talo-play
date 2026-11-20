import { Fragment, isValidElement, type ReactNode } from "react";

/**
 * Turns a tree of plain SVG elements (and the small function components and
 * fragments that build them, like `GameArt`'s scenes) into SVG markup, so it
 * can be drawn as an image where React can't render it (link previews).
 * Not a general renderer: no hooks, no context, no class components.
 */

const KEEP_CASE = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits"]);

function attrName(key: string): string {
  if (KEEP_CASE.has(key)) return key;
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svgString(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escape(String(node));
  if (Array.isArray(node)) return node.map(svgString).join("");
  if (!isValidElement(node)) return "";
  const { type } = node;
  const props = (node.props ?? {}) as Record<string, unknown> & { children?: ReactNode };
  if (type === Fragment) return svgString(props.children);
  if (typeof type === "function") return svgString((type as (p: unknown) => ReactNode)(props));
  if (typeof type !== "string") return "";
  let attrs = "";
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "className" || key === "key" || value === undefined || value === null || value === false) continue;
    if (key === "style") {
      const css = Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.startsWith("--"))
        .map(([k, v]) => `${attrName(k)}:${v}`)
        .join(";");
      if (css) attrs += ` style="${escape(css)}"`;
      continue;
    }
    if (typeof value === "object" || typeof value === "function") continue;
    attrs += ` ${attrName(key)}="${escape(String(value))}"`;
  }
  return `<${type}${attrs}>${svgString(props.children)}</${type}>`;
}
