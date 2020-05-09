import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import typescript from "rollup-plugin-typescript";
import { terser } from "rollup-plugin-terser";
import pkg from "./package.json";

export default [
  // browser-friendly UMD build
  {
    input: "src/index.ts",
    external: ["pako"],
    output: {
      name: "hdr",
      file: pkg.browser,
      format: "umd",
      globals: {
        pako: "pako",
      },
    },
    plugins: [
      resolve(), // so Rollup can find `base64...`
      commonjs(), // so Rollup can convert `base64` to an ES module
      typescript(), // so Rollup can convert TypeScript to JavaScript
      terser(),
    ],
  },

  // CommonJS (for Node) and ES module (for bundlers) build.
  // (We could have three entries in the configuration array
  // instead of two, but it's quicker to generate multiple
  // builds from a single configuration where possible, using
  // an array for the `output` option, where we can specify
  // `file` and `format` for each target)
  {
    input: "src/index.ts",
    plugins: [
      typescript(), // so Rollup can convert TypeScript to JavaScript
    ],
    output: [
      { file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],
  },
];
