import b from "benny";
import { build } from "../index";
import { initWebAssembly } from "../wasm";
import { toSummary } from "../Histogram";
initWebAssembly().then(() => {
  const randomInteger = (max: number = Number.MAX_SAFE_INTEGER) =>
    Math.floor(Math.random() * max);
  const options = { initCount: 100 };

  b.suite(
    "Histogram toJSON()",
    b.add(
      "JS 32B Histogram",
      () => {
        const histogram = build({
          bitBucketSize: 32
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          toSummary(histogram);
        };
      },
      options
    ),

    b.add(
      "WASM 32B Histogram",
      () => {
        const histogram = build({
          bitBucketSize: 32,
          useWebAssembly: true
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          toSummary(histogram);
        };
      },
      options
    ),
    b.add(
      "Packed Histogram",
      () => {
        const histogram = build({
          bitBucketSize: "packed"
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          toSummary(histogram);
        };
      },
      options
    ),
    b.add(
      "WASM Packed Histogram",
      () => {
        const histogram = build({
          bitBucketSize: "packed",
          useWebAssembly: true
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          toSummary(histogram);
        };
      },
      options
    ),

    b.complete(),
    b.save({ file: "json-percentile", format: "chart.html" })
  );
});
