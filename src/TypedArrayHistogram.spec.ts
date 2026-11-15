import Int8Histogram from "./Int8Histogram";
import Int16Histogram from "./Int16Histogram";
import Int32Histogram from "./Int32Histogram";
import Float64Histogram from "./Float64Histogram";

[Int8Histogram, Int16Histogram, Int32Histogram, Float64Histogram].forEach(
  (Histogram) => {
    describe(`${Histogram} histogram`, () => {
      it("should record a value", () => {
        // given
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        // when
        histogram.recordValue(123456);
        // then
        expect(histogram.getCountAtIndex(8073)).toBe(1);
      });

      it("should compute median value in first bucket", () => {
        // given
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValue(123456);
        histogram.recordValue(127);
        histogram.recordValue(42);
        // when
        const medianValue = histogram.getValueAtPercentile(50);
        // then
        expect(medianValue).toBe(127);
      });

      it("should compute value outside first bucket with an error less than 1000", () => {
        // given
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValue(123456);
        histogram.recordValue(122777);
        histogram.recordValue(127);
        histogram.recordValue(42);
        // when
        const percentileValue = histogram.getValueAtPercentile(99.9);
        // then
        expect(Math.abs(percentileValue - 123456)).toBeLessThan(1000);
        // TODO the value is 123519 > max, ask Gil if it is a bug
      });

      it("should resize recording values above max", () => {
        // given
        const histogram = new Histogram(1, 2, 3);
        histogram.autoResize = true;
        // when
        histogram.recordValue(123456);
        histogram.recordValue(127000);
        histogram.recordValue(420000);
        // then
        const medianValue = histogram.getValueAtPercentile(50);
        expect(Math.abs(medianValue - 127000)).toBeLessThan(1000);
      });

      it("should compute proper value at percentile even with rounding issues", () => {
        // given
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValue(1);
        histogram.recordValue(2);
        // when & then
        expect(histogram.getValueAtPercentile(50.0)).toBe(1);
        expect(histogram.getValueAtPercentile(50.00000000000001)).toBe(1);
        expect(histogram.getValueAtPercentile(50.0000000000001)).toBe(2);
      });
    });
  }
);

describe("Typed array histogram count range", () => {
  const cases = [
    { name: "8-bit", Histogram: Int8Histogram, max: 255, bits: 8 },
    { name: "16-bit", Histogram: Int16Histogram, max: 65535, bits: 16 },
    { name: "32-bit", Histogram: Int32Histogram, max: 4294967295, bits: 32 },
  ];

  cases.forEach(({ name, Histogram, max, bits }) => {
    describe(`${name} histogram`, () => {
      it("should accept a count up to the storage maximum", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, max);
        expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(
          max
        );
        expect(histogram.totalCount).toBe(max);
      });

      it("should throw on recordValueWithCount past the storage maximum, leaving the histogram unchanged", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, max);
        expect(() => histogram.recordValueWithCount(42, 1)).toThrow(
          `would overflow ${bits}-bit integer count`
        );
        expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(
          max
        );
        expect(histogram.totalCount).toBe(max);
      });

      it("should throw on recordValue when the counter is already at the maximum", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.setCountAtIndex(histogram.countsArrayIndex(42), max);
        expect(() => histogram.recordValue(42)).toThrow(
          `would overflow ${bits}-bit integer count`
        );
        expect(histogram.totalCount).toBe(0);
      });

      it("should throw on addToCountAtIndex and setCountAtIndex past the maximum", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        expect(() => histogram.setCountAtIndex(5, max + 1)).toThrow(
          "would overflow"
        );
        histogram.setCountAtIndex(5, max - 1);
        expect(() => histogram.addToCountAtIndex(5, 2)).toThrow(
          `would overflow ${bits}-bit integer count`
        );
        expect(histogram.getCountAtIndex(5)).toBe(max - 1);
      });

      it("should throw on a negative count instead of wrapping", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, 3);
        expect(() => histogram.recordValueWithCount(42, -4)).toThrow(
          `would underflow ${bits}-bit integer count`
        );
        expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(
          3
        );
        expect(histogram.totalCount).toBe(3);
      });

      it("should throw on add when the summed count would overflow, leaving the histogram unchanged", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        const other = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, max - 10);
        other.recordValueWithCount(42, 11);
        const before = histogram.summary;
        expect(() => histogram.add(other)).toThrow(
          `would overflow ${bits}-bit integer count`
        );
        expect(histogram.summary).toEqual(before);
        expect(other.totalCount).toBe(11);
      });

      it("should add up to exactly the storage maximum", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        const other = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, max - 10);
        other.recordValueWithCount(42, 10);
        histogram.add(other);
        expect(histogram.getCountAtIndex(histogram.countsArrayIndex(42))).toBe(
          max
        );
        expect(histogram.totalCount).toBe(max);
      });

      it("should throw on subtract when the result would underflow, leaving the histogram unchanged", () => {
        const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        const other = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValueWithCount(42, 5);
        other.recordValueWithCount(42, 6);
        const before = histogram.summary;
        expect(() => histogram.subtract(other)).toThrow(
          `would underflow ${bits}-bit integer count`
        );
        expect(histogram.summary).toEqual(before);
      });
    });
  });

  it("should keep Float64 histograms unbounded by the 32-bit maximum", () => {
    const histogram = new Float64Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    histogram.recordValueWithCount(42, 4294967295);
    histogram.recordValueWithCount(42, 4294967295);
    expect(histogram.totalCount).toBe(8589934590);
  });
});
