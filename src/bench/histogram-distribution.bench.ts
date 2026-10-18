import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram percentile distribution", async ({ bench }) => {
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
      int32.outputPercentileDistribution();
    }),
    bench("WASM 32B Histogram", () => {
      wasm32.outputPercentileDistribution();
    }),
    bench("Packed Histogram", () => {
      packed.outputPercentileDistribution();
    }),
    bench("WASM Packed Histogram", () => {
      wasmPacked.outputPercentileDistribution();
    })
  );
});
