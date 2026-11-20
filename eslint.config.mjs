import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Any verification build too -- see distDir in next.config.ts. Without
    // this, one build into .next-verify took the lint baseline from
    // 80 errors / 831 warnings to 546 / 20,277, all of it generated output.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // VENDORED, NOT WRITTEN HERE. public/wasm/opencv.js is 10.87 MB of
    // Emscripten output, copied verbatim from @techstark/opencv-js by
    // scripts/sync-opencv.mjs. Linting generated C++-to-WebAssembly glue
    // reports 9 errors and 402 warnings about code nobody can act on, and it
    // buried the project's real baseline -- which is the whole reason the
    // baseline is quoted in STATUS.md and watched.
    //
    // public/scripts/raindrop.js is the same kind of file and is NOT ignored
    // here, because it is not mine to decide: it is third-party too, it
    // contributes 16 errors and 798 warnings, and silently excluding it would
    // change a number someone else has been tracking.
    "public/wasm/opencv.js",
  ]),
]);

export default eslintConfig;
