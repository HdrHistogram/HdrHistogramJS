import AutoCountsHistogram from "./AutoCountsHistogram";
import Float64Histogram from "./Float64Histogram";
import Int32Histogram from "./Int32Histogram";
import { build } from "./index";
import JsHistogram from "./JsHistogram";
import type { BitBucketSize } from "./Histogram";
import {
  encodeIntoCompressedBase64,
  decodeFromCompressedBase64,
} from "./encoding";

const newAuto = () => new AutoCountsHistogram(1, 1000000, 3);
const newTwin = () => new Float64Histogram(1, 1000000, 3);

describe("AutoCountsHistogram", () => {
  it("starts with 8-bit counts", () => {
    expect(newAuto().currentBitBucketSize).toBe(8);
  });

  it("is selected by build({ bitBucketSize: 'auto' })", () => {
    const histogram = build({ bitBucketSize: "auto" }) as JsHistogram;
    expect(histogram).toBeInstanceOf(AutoCountsHistogram);
    expect((histogram as AutoCountsHistogram).currentBitBucketSize).toBe(8);
  });

  it("stays at 8 bits while every count is at most 255", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(3, 255);
    histogram.addToCountAtIndex(4, 200);
    expect(histogram.currentBitBucketSize).toBe(8);
    expect(histogram.getCountAtIndex(3)).toBe(255);
    expect(histogram.getCountAtIndex(4)).toBe(200);
  });

  it("promotes 8 -> 16 bits at 256 without wrapping", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(3, 255);
    histogram.incrementCountAtIndex(3);
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.getCountAtIndex(3)).toBe(256);
  });

  it("promotes 16 -> 32 bits at 65536 without wrapping", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(3, 65535);
    expect(histogram.currentBitBucketSize).toBe(16);
    histogram.addToCountAtIndex(3, 1);
    expect(histogram.currentBitBucketSize).toBe(32);
    expect(histogram.getCountAtIndex(3)).toBe(65536);
  });

  it("promotes 32 -> 64 bits at 2^32 without wrapping", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(3, 2 ** 32 - 1);
    expect(histogram.currentBitBucketSize).toBe(32);
    histogram.incrementCountAtIndex(3);
    expect(histogram.currentBitBucketSize).toBe(64);
    expect(histogram.getCountAtIndex(3)).toBe(2 ** 32);
  });

  it("jumps straight to the needed width for a large count", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(0, 2 ** 40);
    expect(histogram.currentBitBucketSize).toBe(64);
    expect(histogram.getCountAtIndex(0)).toBe(2 ** 40);
  });

  it("preserves every count across promotions", () => {
    const histogram = newAuto();
    const twin = newTwin();
    const counts: Array<[number, number]> = [
      [1, 7],
      [2, 255],
      [5, 300],
      [9, 70000],
      [10, 5_000_000_000],
    ];
    for (const [index, count] of counts) {
      histogram.setCountAtIndex(index, count);
      twin.setCountAtIndex(index, count);
    }
    expect(histogram.currentBitBucketSize).toBe(64);
    for (let i = 0; i < histogram.countsArrayLength; i++) {
      expect(histogram.getCountAtIndex(i)).toBe(twin.getCountAtIndex(i));
    }
  });

  it("refuses counts above MAX_SAFE_INTEGER instead of storing them", () => {
    const histogram = newAuto();
    expect(() =>
      histogram.setCountAtIndex(0, Number.MAX_SAFE_INTEGER + 2)
    ).toThrow();
  });

  it("refuses negative counts in every width", () => {
    const histogram = newAuto();
    histogram.setCountAtIndex(0, 1);
    expect(() => histogram.addToCountAtIndex(0, -2)).toThrow();
    histogram.setCountAtIndex(1, 1000);
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(() => histogram.setCountAtIndex(1, -1)).toThrow();
    expect(histogram.getCountAtIndex(1)).toBe(1000);
  });

  it("keeps totalCount, maxValue and minNonZeroValue exact across promotion", () => {
    const histogram = newAuto();
    const twin = newTwin();
    for (const h of [histogram, twin]) {
      h.recordValueWithCount(17, 100000);
      h.recordValueWithCount(999999, 3);
      h.recordValue(4);
    }
    expect(histogram.currentBitBucketSize).toBe(32);
    expect(histogram.totalCount).toBe(twin.totalCount);
    expect(histogram.maxValue).toBe(twin.maxValue);
    expect(histogram.minNonZeroValue).toBe(twin.minNonZeroValue);
    expect(histogram.toJSON()).toStrictEqual(twin.toJSON());
  });

  it("gives the same percentiles as a Float64 histogram", () => {
    const histogram = newAuto();
    const twin = newTwin();
    for (let v = 1; v <= 5000; v++) {
      const count = v % 97 === 0 ? 70000 : (v % 13) + 1;
      histogram.recordValueWithCount(v, count);
      twin.recordValueWithCount(v, count);
    }
    expect(histogram.currentBitBucketSize).toBe(32);
    for (const p of [0, 50, 90, 99, 99.9, 99.99, 100]) {
      expect(histogram.getValueAtPercentile(p)).toBe(
        twin.getValueAtPercentile(p)
      );
    }
    expect(histogram.summary).toStrictEqual(twin.summary);
  });

  it("promotes when adding a histogram with larger counts", () => {
    const histogram = newAuto();
    histogram.recordValueWithCount(42, 10);
    const other = new Int32Histogram(1, 1000000, 3);
    other.recordValueWithCount(42, 300);
    expect(histogram.currentBitBucketSize).toBe(8);
    histogram.add(other);
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(310);
    expect(histogram.totalCount).toBe(310);
  });

  it("keeps the promoted width after subtracting back below 256", () => {
    const histogram = newAuto();
    histogram.recordValueWithCount(42, 300);
    const other = newAuto();
    other.recordValueWithCount(42, 299);
    histogram.subtract(other);
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(1);
    expect(histogram.totalCount).toBe(1);
    expect(histogram.getValueAtPercentile(100)).toBe(42);
  });

  it("keeps the width on clearCounts", () => {
    const histogram = newAuto();
    histogram.recordValueWithCount(1, 1000);
    histogram.clearCounts();
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.getCountAtIndex(histogram.countsArrayIndex(1))).toBe(0);
  });

  it("keeps counts when autoResize widens the range after a promotion", () => {
    const histogram = new AutoCountsHistogram(1, 2, 3);
    histogram.autoResize = true;
    histogram.recordValueWithCount(1, 300);
    histogram.recordValue(123456);
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.totalCount).toBe(301);
    expect(histogram.getCountAtIndex(histogram.countsArrayIndex(1))).toBe(300);
    expect(histogram.getValueAtPercentile(99)).toBeLessThan(1000 + 123456);
  });

  it("promotes when a large count resizes an auto-resizing histogram", () => {
    // given
    const histogram = new AutoCountsHistogram(1, 2, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValueWithCount(123456, 300);
    // then
    expect(histogram.currentBitBucketSize).toBe(16);
    expect(histogram.totalCount).toBe(300);
    expect(histogram.getCountAtIndex(histogram.countsArrayIndex(123456))).toBe(
      300
    );
  });

  it("refuses a negative count before resizing", () => {
    // given
    const histogram = new AutoCountsHistogram(1, 2, 3);
    histogram.autoResize = true;
    const highestTrackableValue = histogram.highestTrackableValue;
    // when
    const recording = () => histogram.recordValueWithCount(123456, -1);
    // then
    expect(recording).toThrow("negative count");
    expect(histogram.highestTrackableValue).toBe(highestTrackableValue);
  });

  it("copies with coordinated omission correction into an auto histogram", () => {
    const histogram = newAuto();
    const twin = newTwin();
    histogram.recordValueWithCount(1000, 300);
    twin.recordValueWithCount(1000, 300);
    const copy = histogram.copyCorrectedForCoordinatedOmission(100);
    expect(copy).toBeInstanceOf(AutoCountsHistogram);
    expect(copy.toJSON()).toStrictEqual(
      twin.copyCorrectedForCoordinatedOmission(100).toJSON()
    );
  });

  describe("encoding round-trip", () => {
    // Largest count that fits each width, so fixed-width decoders do not wrap.
    const fixtures: Array<[number, number]> = [
      [8, 255],
      [16, 65535],
      [32, 2 ** 32 - 1],
      [64, 5_000_000_000],
    ];
    fixtures.forEach(([width, maxCount]) => {
      const targets: BitBucketSize[] = [
        width as BitBucketSize,
        64,
        "packed",
        "auto",
      ];
      targets.forEach((bitBucketSize) => {
        it(`encodes a ${width}-bit-wide auto histogram and decodes it into ${bitBucketSize} buckets`, async () => {
          const histogram = newAuto();
          histogram.recordValue(5);
          histogram.recordValueWithCount(999, maxCount);
          expect(histogram.currentBitBucketSize).toBe(width);
          const b64 = await encodeIntoCompressedBase64(histogram);
          const decoded = await decodeFromCompressedBase64(b64, bitBucketSize);
          expect(decoded.toJSON()).toStrictEqual(histogram.toJSON());
          expect(decoded.totalCount).toBe(histogram.totalCount);
          expect(decoded.getCountAtIndex(histogram.countsArrayIndex(999))).toBe(
            maxCount
          );
        });
      });
    });

    it("decodes into an auto histogram that then promotes", async () => {
      const source = new Int32Histogram(1, 1000000, 3);
      source.recordValueWithCount(9, 100);
      const b64 = await encodeIntoCompressedBase64(source);
      const decoded = (await decodeFromCompressedBase64(
        b64,
        "auto"
      )) as AutoCountsHistogram;
      expect(decoded.currentBitBucketSize).toBe(8);
      decoded.recordValueWithCount(9, 1000);
      expect(decoded.currentBitBucketSize).toBe(16);
      expect(decoded.totalCount).toBe(1100);
    });
  });

  it("refuses WebAssembly for the auto mode", () => {
    expect(() =>
      build({ bitBucketSize: "auto", useWebAssembly: true })
    ).toThrow("not supported with WebAssembly");
  });
});
