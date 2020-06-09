import b from "benny";
import { build } from "../index";
import { initWebAssembly } from "../wasm";
initWebAssembly().then(() => {
  const randomInteger = () => Math.floor(Math.random() * 1000000);
  const randomSmallInteger = () => Math.floor(Math.random() * 1000);
  const options = { initCount: 1000 };

  b.suite(
    "Histogram data access with coordinated ommissions",
    b.add(
      "Int32Histogram",
      () => {
        const histogram = build({ bitBucketSize: 32 });
        return () => {
          histogram.recordValueWithExpectedInterval(randomInteger(), 100000);
        };
      },
      options
    ),

    b.add(
      "Int32Histogram no correction needed",
      () => {
        const histogram = build({ bitBucketSize: 32 });
        return () => {
          histogram.recordValueWithExpectedInterval(
            randomSmallInteger(),
            100000
          );
        };
      },
      options
    ),
    b.add(
      "PackedHistogram",
      () => {
        const histogram = build({ bitBucketSize: "packed" });
        return () => {
          histogram.recordValueWithExpectedInterval(randomInteger(), 100000);
        };
      },
      options
    ),
    b.add(
      "PackedHistogram no correction needed",
      () => {
        const histogram = build({ bitBucketSize: "packed" });
        return () => {
          histogram.recordValueWithExpectedInterval(
            randomSmallInteger(),
            100000
          );
        };
      },
      options
    ),

    b.add(
      "WASM Int32Histogram",
      () => {
        const histogram = build({
          useWebAssembly: true
        });
        return () => {
          histogram.recordValueWithExpectedInterval(randomInteger(), 100000);
        };
      },
      options
    ),

    b.add(
      "WASM Int32Histogram no correction needed",
      () => {
        const histogram = build({
          useWebAssembly: true
        });
        return () => {
          histogram.recordValueWithExpectedInterval(
            randomSmallInteger(),
            100000
          );
        };
      },
      options
    ),

    b.add(
      "WASM PackedHistogram",
      () => {
        const histogram = build({
          useWebAssembly: true,
          bitBucketSize: "packed"
        });
        return () => {
          histogram.recordValueWithExpectedInterval(randomInteger(), 100000);
        };
      },
      options
    ),

    b.add(
      "WASM PackedHistogram no correction needed",
      () => {
        const histogram = build({
          useWebAssembly: true,
          bitBucketSize: "packed"
        });
        return () => {
          histogram.recordValueWithExpectedInterval(
            randomSmallInteger(),
            100000
          );
        };
      },
      options
    ),
    b.complete(),
    b.save({ file: "data-access-co", format: "chart.html" })
  );
});
