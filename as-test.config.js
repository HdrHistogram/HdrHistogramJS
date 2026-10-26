module.exports = {
  include: ["assembly"],
  // Default flags plus SIMD, which the counts-array kernels in Histogram.ts rely on.
  flags: "--exportStart __unit_test_start --sourceMap --debug -O0 --enable simd",
};
