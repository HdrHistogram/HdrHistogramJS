import "core-js";
import Histogram from "./PackedHistogram";

describe("Packed histogram", () => {
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

  it("should compute same values when new or reseted", () => {
    // given
    const histogram = new Histogram(1, 2, 3);
    const histogram2 = new Histogram(1, 2, 3);
    histogram.autoResize = true;
    histogram2.autoResize = true;

    [
      1,
      1332046051815425,
      2416757506927617,
      190173230466049,
      4902619216137729,
    ].forEach((v) => histogram.recordValue(v));

    // when
    histogram.reset();
    [
      6799506329767937,
      4235178677104641,
      8050147459900417,
      8686056656618497,
      3538005630524417,
    ].forEach((v) => {
      histogram.recordValue(v);
      histogram2.recordValue(v);
    });
    // then
    expect(histogram.outputPercentileDistribution()).toBe(
      histogram2.outputPercentileDistribution()
    );
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
  });

  it("should resize underlying packed array when recording an out of bound value", () => {
    // given
    const histogram = new Histogram(1, 2, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(123456);
    // then
    expect(histogram.totalCount).toBe(1);
  });
});
