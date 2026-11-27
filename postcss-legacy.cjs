// Fallbacks so Talo still looks right on older Chromium (TV browsers:
// Samsung Tizen, LG webOS…), added after Tailwind and before
// @csstools/postcss-cascade-layers. Everything here is either ignored by
// modern browsers or repeats what they already do, so nobody else pays for it
// beyond a few bytes.
//
// 1. dvh/svh/lvh (Chrome 108): a `vh` copy of the declaration before it.
// 2. Tailwind gives its @property variables (borders, shadows, transforms…)
//    their initial values with an @supports block aimed at old Safari and
//    Firefox; without it (old Chrome has no @property) `border` draws no
//    border. The block is widened to any browser without lab() colors.
// 3. translate/scale/rotate as separate properties (Chrome 104): an equivalent
//    `transform` under @supports not (translate: 0).
// 4. Logical shorthands (padding-inline for px-*, inset-x…, Chrome 87) that
//    Lightning CSS leaves alone when the value has var(): the physical
//    properties before them (Talo is left to right, so it's the same).
// 5. :is()/:where() (Chrome 88: space-y, divide-y, group-hover…): a copy of
//    the rule with them unrolled, under @supports not (translate: 0), so
//    browsers that know :where() (and its zero specificity) never see it.

const VIEWPORT = /(-?[\d.]+)(?:d|s|l)vh\b/g;
const SUPPORTS_OLD = "not (translate: 0)";

// Splits on spaces outside parentheses: "a calc(1 + 2)" → ["a", "calc(1 + 2)"].
function words(value) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const PAIRS = {
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block": ["padding-top", "padding-bottom"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block": ["margin-top", "margin-bottom"],
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
  "scroll-padding-inline": ["scroll-padding-left", "scroll-padding-right"],
  "scroll-padding-block": ["scroll-padding-top", "scroll-padding-bottom"],
  "scroll-margin-inline": ["scroll-margin-left", "scroll-margin-right"],
  "scroll-margin-block": ["scroll-margin-top", "scroll-margin-bottom"],
};
const SINGLE = {
  "inset-inline-start": "left",
  "inset-inline-end": "right",
  "inset-block-start": "top",
  "inset-block-end": "bottom",
};
for (const part of ["width", "style", "color"]) {
  PAIRS[`border-inline-${part}`] = [`border-left-${part}`, `border-right-${part}`];
  PAIRS[`border-block-${part}`] = [`border-top-${part}`, `border-bottom-${part}`];
}

function physical(decl) {
  const { prop, value } = decl;
  if (prop === "inset") {
    const w = words(value);
    const [t, r = t, b = t, l = r] = w;
    return [["top", t], ["right", r], ["bottom", b], ["left", l]];
  }
  if (SINGLE[prop]) return [[SINGLE[prop], value]];
  const pair = PAIRS[prop];
  if (!pair) return null;
  const [a, b = a] = words(value);
  return [[pair[0], a], [pair[1], b]];
}

// --- :is()/:where() unrolling -------------------------------------------

// Index of the ")" closing the "(" at `open`, skipping escapes and strings.
function closing(sel, open) {
  let depth = 0;
  for (let i = open; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = sel.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Splits at top-level commas (or, with `combinators`, says if there is a
// top-level space / > / + / ~).
function topLevel(sel, test) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && test(ch)) {
      parts.push(sel.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(sel.slice(start));
  return parts;
}
const hasCombinator = (sel) => topLevel(sel.trim(), (ch) => /[\s>+~]/.test(ch)).length > 1;

// First unescaped ":is(" / ":where(" → its position and name length.
function findIs(sel) {
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === "\\") {
      i++;
      continue;
    }
    if (sel[i] !== ":") continue;
    if (sel.startsWith(":is(", i)) return [i, 3];
    if (sel.startsWith(":where(", i)) return [i, 6];
  }
  return null;
}

// Pseudo-classes old Chromium doesn't know: one in a selector list drops the
// whole rule, so those alternatives are left out.
const UNKNOWN = /:(popover-open|open|focus-visible|has|user-valid|user-invalid|modal|where|is)\b/;

// One complex selector → the plain selectors it stands for, or null.
function unroll(sel, depth = 0) {
  if (depth > 8) return null;
  const hit = findIs(sel);
  if (!hit) return [sel];
  const [at, len] = hit;
  const close = closing(sel, at + len);
  if (close < 0) return null;
  const before = sel.slice(0, at);
  const after = sel.slice(close + 1);
  const out = [];
  for (const raw of topLevel(sel.slice(at + len + 1, close), (ch) => ch === ",")) {
    const args = unroll(raw.trim(), depth + 1);
    if (!args) return null;
    for (const arg of args) {
      let joined;
      if (!hasCombinator(arg)) joined = before + arg + after;
      else if (!before.trim() && !after.trim()) joined = arg;
      else if (/\s\*$/.test(arg) && !hasCombinator(before) && !after.trim()) {
        // ".x:is(.group:hover *)" → ".group:hover .x"
        joined = `${arg.replace(/\s\*$/, "")} ${before}`;
      } else return null;
      const more = unroll(joined, depth + 1);
      if (!more) return null;
      out.push(...more);
    }
  }
  return out;
}

function unrolledSelector(selector) {
  const list = [];
  for (const one of topLevel(selector, (ch) => ch === ",")) {
    const plain = unroll(one.trim());
    if (!plain) return null;
    list.push(...plain.filter((s) => !UNKNOWN.test(s)));
  }
  return list.length ? [...new Set(list)].join(",") : null;
}

function scaleValue(raw, rule) {
  // "var(--tw-scale-x) var(--tw-scale-y)" → the values set in the same rule.
  const own = (name) => {
    let found = null;
    rule.walkDecls(name, (d) => {
      found = d.value;
    });
    return found;
  };
  const num = (v) => {
    if (v == null) return null;
    const m = /^(-?[\d.]+)%$/.exec(v.trim());
    return m ? String(Number(m[1]) / 100) : v.trim();
  };
  const parts = raw.trim().split(/\s+(?![^(]*\))/);
  const resolve = (p) => {
    const m = /^var\((--[\w-]+)\)$/.exec(p);
    if (!m) return num(p);
    return num(own(m[1])) ?? `var(${m[1]},1)`;
  };
  const x = resolve(parts[0]);
  const y = parts[1] ? resolve(parts[1]) : x;
  return [x, y];
}

module.exports = () => ({
  postcssPlugin: "talo-legacy",
  OnceExit(root, { AtRule, Rule, Declaration }) {
    // 1. Viewport units.
    root.walkDecls((decl) => {
      if (!VIEWPORT.test(decl.value)) return;
      VIEWPORT.lastIndex = 0;
      decl.cloneBefore({ value: decl.value.replace(VIEWPORT, "$1vh") });
    });

    // 4. Logical shorthands.
    root.walkDecls((decl) => {
      const phys = physical(decl);
      if (!phys) return;
      for (const [prop, value] of phys) decl.cloneBefore({ prop, value });
    });

    // 2. Initial values of Tailwind's variables.
    root.walkAtRules("supports", (at) => {
      if (/-webkit-hyphens\s*:\s*none/.test(at.params) && !at.params.includes("lab(")) {
        at.params = `${at.params} or (not (color: lab(0% 0 0)))`;
      }
    });

    // 3. Individual transform properties.
    const touched = [];
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
      const decls = [];
      rule.each((n) => {
        if (n.type === "decl" && /^(translate|scale|rotate)$/.test(n.prop)) decls.push(n);
      });
      if (decls.length) touched.push([rule, decls]);
    });
    const TRANSFORM =
      "translate(var(--tw-translate-x,0),var(--tw-translate-y,0)) rotate(var(--lg-r,0deg)) scale(var(--lg-sx,1),var(--lg-sy,1))";
    for (const [rule, decls] of touched) {
      const clone = new Rule({ selector: rule.selector });
      for (const d of decls) {
        if (d.prop === "rotate") clone.append(new Declaration({ prop: "--lg-r", value: d.value }));
        if (d.prop === "scale") {
          const [x, y] = scaleValue(d.value, rule);
          clone.append(new Declaration({ prop: "--lg-sx", value: x }));
          clone.append(new Declaration({ prop: "--lg-sy", value: y }));
        }
      }
      clone.append(new Declaration({ prop: "transform", value: TRANSFORM }));
      const supports = new AtRule({ name: "supports", params: SUPPORTS_OLD });
      supports.append(clone);
      rule.after(supports);
    }

    // 5. :is()/:where() unrolled (also in the transform copies just made).
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
      if (!findIs(rule.selector)) return;
      const selector = unrolledSelector(rule.selector);
      if (!selector) return;
      const supports = new AtRule({ name: "supports", params: SUPPORTS_OLD });
      supports.append(rule.clone({ selector }));
      rule.after(supports);
    });

    if (!touched.length) return;
    // The helper variables would otherwise be inherited by children.
    const reset = new AtRule({ name: "supports", params: SUPPORTS_OLD });
    reset.append(
      new Rule({
        selector: "*",
        nodes: [
          new Declaration({ prop: "--lg-r", value: "0deg" }),
          new Declaration({ prop: "--lg-sx", value: "1" }),
          new Declaration({ prop: "--lg-sy", value: "1" }),
        ],
      }),
    );
    // In the base layer (declared at the end, after Tailwind fixed the
    // order), so every utility still beats it.
    const base = new AtRule({ name: "layer", params: "base" });
    base.append(reset);
    root.append(base);
  },
});
module.exports.postcss = true;
