module.exports = function(wallaby) {
  //process.env.NODE_PATH += path.delimiter + wallaby.projectCacheDir;

  return {
    files: [
      // Source code
      { pattern: "src/**/*.ts", load: false },
      { pattern: "src/**/*.js", load: false },
      { pattern: "test_files/*.hlog", load: false },
      { pattern: "src/**/*spec.ts", ignore: true },
    ],

    tests: [
      // Unit tests
      { pattern: "src/**/*spec.ts" },
      { pattern: "src/**/*.fc.spec.ts", ignore: true },
    ],

    env: { type: "node" },

    testFramework: "jest",

    debug: true,
  };
};
