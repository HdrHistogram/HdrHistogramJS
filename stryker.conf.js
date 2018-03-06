module.exports = function(config) {
    config.set({
      mutate: [
        "src/**/*.ts",
        "!src/**/*.spec.ts"
      ],
      testFramework: 'mocha',
      testRunner: 'mocha',
      mutator: "typescript",
      transpilers: [ "typescript" ],
      reporter: ["clear-text", "progress", "html"],
      tsconfigFile: 'tsconfig.json',
      coverageAnalysis: "all",
      maxConcurrentTestRunners: 3,
    });
  };