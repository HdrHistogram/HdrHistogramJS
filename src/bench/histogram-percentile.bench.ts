import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram get value at percentile", async ({ bench }) => {
  const int32 = buildFilledHistogram({ bitBucketSize: 32 });
  const wasm32 = buildFilledHistogram({
    bitBucketSize: 32,
    useWebAssembly: true
  });
  const packed = buildFilledHistogram({ bitBucketSize: "packed" });
  const wasmPacked = buildFilledHistogram({
    bitBucketSize: "packed",
    useWebAssembly: true
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
