import Histogram from "./PackedHistogram";
import { Int32Histogram } from "./index";
import { encodeIntoCompressedBase64 } from "./encoding";
import { initWebAssembly } from "./wasm";

beforeAll(() => initWebAssembly());

// Records the same counts in a packed histogram and in its Int32 twin: a contiguous band of
// latencies in the centre, and isolated values across the tails.
const recordBoth = () => {
  const packed = new Histogram(1, 3_600_000_000, 3);
  const int32 = new Int32Histogram(1, 3_600_000_000, 3);
  let seed = 99;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let k = 0; k < 20000; k++) {
    const value =
      rand() < 0.7
        ? 1_000_000 + Math.floor(rand() * 5000)
        : Math.floor(rand() * 3_600_000_000);
    const count = 1 + Math.floor(rand() * 300);
    packed.recordValueWithCount(value, count);
    int32.recordValueWithCount(value, count);
  }
  return { packed, int32 };
};

describe("Packed histogram cross-check against Int32 histogram", () => {
  it("should encode the same bytes as the Int32 histogram with the same counts", async () => {
    // given
    const { packed, int32 } = recordBoth();

    // when
    const packedEncoded = await encodeIntoCompressedBase64(packed);
    const int32Encoded = await encodeIntoCompressedBase64(int32);

    // then
    expect(packed.totalCount).toBe(int32.totalCount);
    expect(packedEncoded).toBe(int32Encoded);
  });

  it("should report the same percentiles as the Int32 histogram", () => {
    // given
    const { packed, int32 } = recordBoth();

    // then
    for (const percentile of [1, 50, 90, 99, 99.99]) {
      expect(packed.getValueAtPercentile(percentile)).toBe(
        int32.getValueAtPercentile(percentile)
      );
    }
  });
});
