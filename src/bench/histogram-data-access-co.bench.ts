import { build } from "../index";
import { initWebAssembly } from "../wasm";

const randomInteger = () => Math.floor(Math.random() * 1000000);
const randomSmallInteger = () => Math.floor(Math.random() * 1000);
const expectedInterval = 100000;

beforeAll(() => initWebAssembly());

test("Histogram data access with coordinated omissions", async ({ bench }) => {
  const int32 = build({ bitBucketSize: 32 });
  const int32NoCorrection = build({ bitBucketSize: 32 });
  const packed = build({ bitBucketSize: "packed" });
  const packedNoCorrection = build({ bitBucketSize: "packed" });
  const wasm32 = build({ useWebAssembly: true });
  const wasm32NoCorrection = build({ useWebAssembly: true });
  const wasmPacked = build({ useWebAssembly: true, bitBucketSize: "packed" });
  const wasmPackedNoCorrection = build({
    useWebAssembly: true,
    bitBucketSize: "packed"
  });

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.recordValueWithExpectedInterval(randomInteger(), expectedInterval);
    }),
    bench("Int32Histogram no correction needed", () => {
      int32NoCorrection.recordValueWithExpectedInterval(
        randomSmallInteger(),
        expectedInterval
      );
    }),
    bench("PackedHistogram", () => {
      packed.recordValueWithExpectedInterval(randomInteger(), expectedInterval);
    }),
    bench("PackedHistogram no correction needed", () => {
      packedNoCorrection.recordValueWithExpectedInterval(
        randomSmallInteger(),
        expectedInterval
      );
    }),
    bench("WASM Int32Histogram", () => {
      wasm32.recordValueWithExpectedInterval(randomInteger(), expectedInterval);
    }),
    bench("WASM Int32Histogram no correction needed", () => {
      wasm32NoCorrection.recordValueWithExpectedInterval(
        randomSmallInteger(),
        expectedInterval
      );
    }),
    bench("WASM PackedHistogram", () => {
      wasmPacked.recordValueWithExpectedInterval(
        randomInteger(),
        expectedInterval
      );
    }),
    bench("WASM PackedHistogram no correction needed", () => {
      wasmPackedNoCorrection.recordValueWithExpectedInterval(
        randomSmallInteger(),
        expectedInterval
      );
    })
  );
});
