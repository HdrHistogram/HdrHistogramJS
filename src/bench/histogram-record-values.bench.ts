import { build, BuildRequest, Histogram } from "../index";
import { initWebAssembly } from "../wasm";

beforeAll(() => initWebAssembly());

// Latency-like values (1 to ~1.2 million), generated once outside the measured functions.
const VALUE_COUNT = 10_000;
const values = Array.from({ length: VALUE_COUNT }, () =>
  Math.floor(Math.exp(Math.random() * 14))
);

const newHistogram = (request: BuildRequest): Histogram =>
  build({
    lowestDiscernibleValue: 1,
    highestTrackableValue: 3_600_000_000,
    numberOfSignificantValueDigits: 3,
    autoResize: false,
    ...request,
  });

const recordOneByOne = (histogram: Histogram, input: number[]) => {
  for (let index = 0; index < input.length; index++) {
    histogram.recordValue(input[index]);
  }
};

test("Histogram record values", async ({ bench }) => {
  // Each row gets its own histogram, built outside the measured functions
  const int32Loop = newHistogram({ bitBucketSize: 32 });
  const int32Batch = newHistogram({ bitBucketSize: 32 });
  const wasm32Loop = newHistogram({ bitBucketSize: 32, useWebAssembly: true });
  const wasm32Batch = newHistogram({ bitBucketSize: 32, useWebAssembly: true });
  const packedLoop = newHistogram({ bitBucketSize: "packed" });
  const packedBatch = newHistogram({ bitBucketSize: "packed" });
  const wasmPackedLoop = newHistogram({
    bitBucketSize: "packed",
    useWebAssembly: true,
  });
  const wasmPackedBatch = newHistogram({
    bitBucketSize: "packed",
    useWebAssembly: true,
  });

  await bench.compare(
    bench("Int32Histogram recordValue loop", () => {
      recordOneByOne(int32Loop, values);
    }),
    bench("Int32Histogram recordValues", () => {
      int32Batch.recordValues(values);
    }),
    bench("WASM 32B Histogram recordValue loop", () => {
      recordOneByOne(wasm32Loop, values);
    }),
    bench("WASM 32B Histogram recordValues", () => {
      wasm32Batch.recordValues(values);
    }),
    bench("Packed Histogram recordValue loop", () => {
      recordOneByOne(packedLoop, values);
    }),
    bench("Packed Histogram recordValues", () => {
      packedBatch.recordValues(values);
    }),
    bench("WASM Packed Histogram recordValue loop", () => {
      recordOneByOne(wasmPackedLoop, values);
    }),
    bench("WASM Packed Histogram recordValues", () => {
      wasmPackedBatch.recordValues(values);
    })
  );
});
