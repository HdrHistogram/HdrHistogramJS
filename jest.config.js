module.exports = {
  transform: {
    ".+\\.ts?$": "ts-jest",
  },
  rootDir: "src",
  globals: {
    "ts-jest": {
      diagnostics: true,
      tsConfig: "./tsconfig.json",
    },
  },
};
