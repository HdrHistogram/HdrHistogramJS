import { build, Histogram } from "../index";
import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram get value at percentile", async ({ bench }) => {
  const int32 = buildFilledHistogram({ bitBucketSize: 32 });
  const wasm32 = buildFilledHistogram({
    bitBucketSize: 32,
    useWebAssembly: true,
  });
  const packed = buildFilledHistogram({ bitBucketSize: "packed" });
  const wasmPacked = buildFilledHistogram({
    bitBucketSize: "packed",
    useWebAssembly: true,
  });

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.getValueAtPercentile(99);
    }),
    bench("WASM 32B Histogram", () => {
      wasm32.getValueAtPercentile(99);
    }),
    bench("Packed Histogram", () => {
      packed.getValueAtPercentile(99);
    }),
    bench("WASM Packed Histogram", () => {
      wasmPacked.getValueAtPercentile(99);
    })
  );
});

// Latency-like data: 1024 samples between 100µs and 10ms expressed in
// nanoseconds, in a histogram able to track up to Number.MAX_SAFE_INTEGER. The
// recorded values occupy a small slice of the counts array, so this is where
// bounding the scans by the recorded min and max values pays off.
test("Histogram get value at percentile, latency-like distribution", async ({
  bench,
}) => {
  const fill = (histogram: Histogram) => {
    for (let index = 0; index < 1024; index++) {
      histogram.recordValue(100_000 + Math.floor(Math.random() * 9_900_000));
    }
    return histogram;
  };
  const request = { highestTrackableValue: Number.MAX_SAFE_INTEGER };
  const int32 = fill(build({ ...request, bitBucketSize: 32 }));
  const wasm32 = fill(
    build({ ...request, bitBucketSize: 32, useWebAssembly: true })
  );
  const packed = fill(build({ ...request, bitBucketSize: "packed" }));
  const wasmPacked = fill(
    build({ ...request, bitBucketSize: "packed", useWebAssembly: true })
  );

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.getValueAtPercentile(99);
    }),
    bench("WASM 32B Histogram", () => {
      wasm32.getValueAtPercentile(99);
    }),
    bench("Packed Histogram", () => {
      packed.getValueAtPercentile(99);
    }),
    bench("WASM Packed Histogram", () => {
      wasmPacked.getValueAtPercentile(99);
    })
  );
});
