module.exports = {
  setupFiles: ['../setup-jest.js'],
  transform: {
    ".+\\.ts?$": "ts-jest",
    ".+\\.js?$": "babel-jest",
  },
  transformIgnorePatterns: [
    '/node_modules/(?!@assemblyscript\/loader)'
  ],
  rootDir: "src",
  globals: {
    "ts-jest": {
      diagnostics: true,
      tsConfig: "./tsconfig.json",
    },
  },
};
