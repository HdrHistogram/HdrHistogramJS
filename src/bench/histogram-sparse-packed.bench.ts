import { build, Histogram } from "../index";
import { encodeIntoCompressedBase64 } from "../encoding";
import { initWebAssembly } from "../wasm";

// A sparse histogram: a few hundred distinct values spread over a wide range,
// so that most of the counts array is empty. Scans over the counts array
// (percentiles, add, encoding) then cost far more than the recorded values
// warrant unless the packed representation skips its empty subtrees.
const RECORDED_VALUES = 300;
const values: number[] = [];
for (let i = 0; i < RECORDED_VALUES; i++) {
  values.push(1 + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

const buildSparseHistogram = (
  bitBucketSize: 32 | "packed",
  useWebAssembly: boolean
): Histogram => {
  const histogram = build({
    bitBucketSize,
    useWebAssembly,
    autoResize: false,
    highestTrackableValue: Number.MAX_SAFE_INTEGER,
    numberOfSignificantValueDigits: 3,
  });
  values.forEach((value) => histogram.recordValue(value));
  return histogram;
};

beforeAll(() => initWebAssembly());

test("Sparse histogram get value at percentile", async ({ bench }) => {
  const int32 = buildSparseHistogram(32, false);
  const packed = buildSparseHistogram("packed", false);
  const wasmPacked = buildSparseHistogram("packed", true);

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.getValueAtPercentile(99);
    }),
    bench("Packed Histogram", () => {
      packed.getValueAtPercentile(99);
    }),
    bench("WASM Packed Histogram", () => {
      wasmPacked.getValueAtPercentile(99);
    })
  );
});

// No WASM variant: the wasm module exports no addHistogramPackedto* entry
// point, so a WASM packed histogram cannot be added to another one yet.
test("Sparse histogram add", async ({ bench }) => {
  const int32 = buildSparseHistogram(32, false);
  const int32Other = buildSparseHistogram(32, false);
  const packed = buildSparseHistogram("packed", false);
  const packedOther = buildSparseHistogram("packed", false);

  await bench.compare(
    bench("Int32Histogram", () => {
      int32.add(int32Other);
    }),
    bench("Packed Histogram", () => {
      packed.add(packedOther);
    })
  );
});

test("Sparse histogram encoding", async ({ bench }) => {
  const int32 = buildSparseHistogram(32, false);
  const packed = buildSparseHistogram("packed", false);
  const wasmPacked = buildSparseHistogram("packed", true);

  await bench.compare(
    bench("Int32Histogram", async () => {
      await encodeIntoCompressedBase64(int32);
    }),
    bench("Packed Histogram", async () => {
      await encodeIntoCompressedBase64(packed);
    }),
    bench("WASM Packed Histogram", async () => {
      await encodeIntoCompressedBase64(wasmPacked);
    })
  );
});
