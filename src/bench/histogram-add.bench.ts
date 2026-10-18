import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram add", async ({ bench }) => {
  const int32 = buildFilledHistogram();
  const int32Other = buildFilledHistogram();
  const wasm32 = buildFilledHistogram({ useWebAssembly: true });
  const wasm32Other = buildFilledHistogram({ useWebAssembly: true });
  const packed = buildFilledHistogram({ bitBucketSize: "packed" });
  const packedOther = buildFilledHistogram({ bitBucketSize: "packed" });

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.add(int32Other);
    }),
    bench("WASM 32B Histogram", () => {
      wasm32.add(wasm32Other);
    }),
    bench("Packed Histogram", () => {
      packed.add(packedOther);
    })
  );
});
