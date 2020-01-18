import "core-js";
import { expect } from "chai";
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
    expect(medianValue).equals(127);
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
    expect(percentileValue).satisfies(
      (result: number) => Math.abs(result - 123456) < 1000
    );
  });

  it("should resize underlying packed array when recording an out of bound value", () => {
    // given
    const histogram = new Histogram(1, 2, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(123456);
    // then
    expect(histogram.totalCount).to.equal(1);
  });
});
