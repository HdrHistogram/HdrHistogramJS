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
];
