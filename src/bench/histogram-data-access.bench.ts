import { build } from "../index";
import { initWebAssembly } from "../wasm";

const randomInteger = () =>
  Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

beforeAll(() => initWebAssembly());

test("Histogram data access", async ({ bench }) => {
  const int32 = build({ bitBucketSize: 32 });
  const packed = build({ bitBucketSize: "packed" });
  const float64 = build({ bitBucketSize: 64 });
  const int32Eager = build({
    bitBucketSize: 32,
    highestTrackableValue: Number.MAX_SAFE_INTEGER
  });
  const wasm32 = build({ useWebAssembly: true });
  const wasmPacked = build({ useWebAssembly: true, bitBucketSize: "packed" });
  const float64Eager = build({
    bitBucketSize: 64,
    highestTrackableValue: Number.MAX_SAFE_INTEGER
  });

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.recordValue(randomInteger());
    }),
    bench("PackedHistogram", () => {
      packed.recordValue(randomInteger());
    }),
    bench("Float64Histogram", () => {
      float64.recordValue(randomInteger());
    }),
    bench("Int32Histogram eager allocation", () => {
      int32Eager.recordValue(randomInteger());
    }),
    bench("WASM Int32Histogram", () => {
      wasm32.recordValue(randomInteger());
    }),
    bench("WASM PackedHistogram", () => {
      wasmPacked.recordValue(randomInteger());
    }),
    bench("Float64Histogram eager allocation", () => {
      float64Eager.recordValue(randomInteger());
    })
  );
});
