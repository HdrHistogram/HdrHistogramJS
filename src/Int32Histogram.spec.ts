import "core-js";
import { expect } from "chai";
import Histogram from "./Int32Histogram";

describe("Int32 histogram", () => {
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
    expect(medianValue).satisfies(
      (result: number) => Math.abs(result - 127000) < 1000
    );
  });

  it("should compute proper value at percentile even with rounding issues", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    histogram.recordValue(1);
    histogram.recordValue(2);
    // when & then
    expect(histogram.getValueAtPercentile(50.0)).equals(1);
    expect(histogram.getValueAtPercentile(50.00000000000001)).equals(1);
    expect(histogram.getValueAtPercentile(50.0000000000001)).equals(2);
  });

  /*
  it.only("should bench", () => {
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    for (var i = 0; i < 1000; i++) {
       histogram.recordValue(Math.floor(Math.random() * 100000));
    }
    const start = new Date().getTime();
    const nbLoop = 100000;
    for (var i = 0; i < nbLoop; i++) {
       histogram.recordValue(Math.floor(Math.random() * 100000));
    }
    const end = new Date().getTime();
    console.log("avg", (end - start)/nbLoop );

  }) 
*/
});
