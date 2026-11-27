import { fileURLToPath } from "node:url";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Older browsers (TVs): see the file. Then @layer is unrolled into plain
    // rules with the same priority (Chromium < 99 drops whole @layer blocks).
    // Plugins go by name; a local one needs its absolute path for Turbopack.
    [fileURLToPath(new URL("./postcss-legacy.cjs", import.meta.url))]: {},
    "@csstools/postcss-cascade-layers": {},
  },
};

export default config;
