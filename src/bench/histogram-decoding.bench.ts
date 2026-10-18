import {
  encodeIntoCompressedBase64,
  decodeFromCompressedBase64
} from "../encoding";
import { initWebAssembly } from "../wasm";
import { buildFilledHistogram } from "./support";

beforeAll(() => initWebAssembly());

test("Histogram decoding", async ({ bench }) => {
  const encoded = await encodeIntoCompressedBase64(buildFilledHistogram());

  await bench.compare(
    bench("Int32Histogram", async () => {
      (await decodeFromCompressedBase64(encoded, 32, false)).destroy();
    }),
    bench("WASM 32B Histogram", async () => {
      (await decodeFromCompressedBase64(encoded, 32, true)).destroy();
    }),
    bench("Packed Histogram", async () => {
      (await decodeFromCompressedBase64(encoded, "packed", false)).destroy();
    }),
    bench("WASM Packed Histogram", async () => {
      (await decodeFromCompressedBase64(encoded, "packed", true)).destroy();
    })
  );
});
