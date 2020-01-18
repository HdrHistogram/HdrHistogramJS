import b from "benny";
import { build } from "../index";

b.suite(
  "Histogram data access",
  b.add("Int32Histogram", () => {
    const histogram = build({ bitBucketSize: 32 });
    return () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    };
  }),
  b.add("PackedHistogram", () => {
    const histogram = build({ bitBucketSize: "packed" });
    return () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    };
  }),
  b.add("Float64Histogram", () => {
    const histogram = build({ bitBucketSize: 64 });
    return () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    };
  }),
  b.add("SparseArrayHistogram", () => {
    const histogram = build({ bitBucketSize: "sparse_array" });
    return () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    };
  }),
  b.complete(),
  b.save({ file: "data-access", format: "chart.html" })
);
