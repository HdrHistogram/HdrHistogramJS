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
