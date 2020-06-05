import b from "benny";
import { build } from "../index";
import { initWebAssembly } from "../wasm";
initWebAssembly().then(() => {
  const randomInteger = (max: number = Number.MAX_SAFE_INTEGER) =>
    Math.floor(Math.random() * max);
  const options = { initCount: 1000 };

  b.suite(
    "Histogram add",
    b.add(
      "Int32Histogram",
      () => {
        const histogram = build();
        const histogram2 = build();
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
          histogram2.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          histogram.add(histogram2);
        };
      },
      options
    ),

    b.add(
      "WASM 32B Histogram",
      () => {
        const histogram = build({ useWebAssembly: true });
        const histogram2 = build({ useWebAssembly: true });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
          histogram2.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          histogram.add(histogram2);
        };
      },
      options
    ),
    b.add(
      "Packed Histogram",
      () => {
        const histogram = build({ bitBucketSize: "packed" });
        const histogram2 = build({ bitBucketSize: "packed" });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
          histogram2.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          histogram.add(histogram2);
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
        const histogram2 = build({
          bitBucketSize: "packed",
          useWebAssembly: true
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
          histogram2.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        return () => {
          histogram.add(histogram2);
        };
      },
      options
    ),

    b.complete(),
    b.save({ file: "add", format: "chart.html" })
  );
});
