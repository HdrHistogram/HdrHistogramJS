module.exports = {
  setupFiles: ['../setup-jest.js'],
  transform: {
    ".+\\.ts?$": ["ts-jest", {
      diagnostics: true,
      tsconfig: "./tsconfig.json",
    }],
    ".+\\.js?$": "babel-jest",
  },
  transformIgnorePatterns: [
    '/node_modules/(?!@assemblyscript\/loader)'
  ],
  rootDir: "src",
};
