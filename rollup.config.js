import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import pkg from "./package.json" with { type: "json" };

export default [
  // browser-friendly UMD build
  {
    input: "src/index.ts",
    output: {
      name: "hdr",
      file: pkg.browser,
      format: "umd",
    },
    plugins: [
      nodeResolve(), // so Rollup can find `base64...`
      commonjs(), // so Rollup can convert `base64` to an ES module
      typescript({
        // Rollup requires ES modules from the TS plugin (tsconfig uses commonjs
        // for the Node build); exclude tests and their vitest globals.
        compilerOptions: { module: "esnext", types: ["node"] },
        exclude: ["**/*.spec.ts", "**/*.test.ts", "src/bench/**"],
      }), // so Rollup can convert TypeScript to JavaScript
      terser(),
    ],
  },
];
