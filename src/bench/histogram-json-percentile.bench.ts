import { toSummary } from "../Histogram";
import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram toJSON()", async ({ bench }) => {
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
    bench("JS 32B Histogram", () => {
      toSummary(int32);
    }),
    bench("WASM 32B Histogram", () => {
      toSummary(wasm32);
    }),
    bench("Packed Histogram", () => {
      toSummary(packed);
    }),
    bench("WASM Packed Histogram", () => {
      toSummary(wasmPacked);
    })
  );
});
