import { defineConfig } from "tsdown";

const common = {
  entry: ["src/index.ts"],
  platform: "neutral" as const,
  target: "es2017" as const,
  minify: true,
  sourcemap: true,
  outDir: "dist",
};

export default defineConfig([
  // ESM + CJS: unbundled (one output module per source file) so consumers'
  // bundlers can tree-shake unused histogram types — importing e.g. only
  // `Int32Histogram` drops the WASM blob and everything else it doesn't use.
  // Paired with "sideEffects": false in package.json.
  {
    ...common,
    format: ["esm", "cjs"],
    unbundle: true,
    dts: true,
    clean: true,
  },
  // Browser build: a single bundled UMD file exposing the `hdr` global.
  // Filename kept as dist/hdrhistogram.umd.js for existing <script>/CDN references.
  {
    ...common,
    format: ["umd"],
    globalName: "hdr",
    dts: false,
    clean: false,
    outputOptions(options, format) {
      if (format === "umd") {
        return { ...options, entryFileNames: "hdrhistogram.umd.js" };
      }
      return options;
    },
  },
]);
