import "core-js";
import { expect } from "chai";
import Histogram from "./Int8Histogram";

describe("Int8 histogram", () => {
  it("should record a value", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123456);
    // then
    expect(histogram.counts[8073]).equals(1);
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
});
