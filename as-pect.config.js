module.exports = {
  /**
   * Globs that qualify TypeScript files as test entry points.
   * (In as-pect v8 this is "entries"; "include" means helper files.)
   */
  entries: ["assembly/__tests__/**/*.spec.ts"],
  /**
   * Additional files that are added to every test compilation
   * (e.g. shared helpers / include files).
   */
  include: [
    "node_modules/@as-pect/assembly/assembly/index.ts",
    "assembly/__tests__/**/*.include.ts",
  ],
  /**
   * RegExps that exclude source files from testing.
   */
  disclude: [/node_modules/],
  /**
   * Instantiate the WASM module for each test.
   * Compiler flags live in as-pect.asconfig.json (--runtime etc.).
   */
  async instantiate(memory, createImports, instantiate, binary) {
    return await instantiate(binary, createImports({}));
  },
  outputBinary: false,
};
