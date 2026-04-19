/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import {
  Histogram8,
  Histogram16,
  Storage,
  PackedHistogram,
  Histogram64,
} from "../Histogram";

const buildHistogram = (): Histogram8 =>
  new Histogram8(
    1,
    9007199254740991, // Number.MAX_SAFE_INTEGER
    3
  );

describe("Histogram", () => {
  test("should be instantiable", () => {
    const h = buildHistogram();
    h.autoResize;
    expect<bool>(h.autoResize).equal(false);
  });
});

describe("Histogram initialization", () => {
  test("should set sub bucket size", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<u64>(histogram.subBucketCount).equal(2048);
  });

  test("should set resize to false when max value specified", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<bool>(histogram.autoResize).equal(false);
  });

  test("should compute counts array length", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<usize>(histogram.countsArrayLength).equal(45056);
  });
  test("should compute bucket count", () => {
    const histogram: Histogram8 = buildHistogram();
    expect(histogram.bucketCount).equal(43);
  });

  test("should set max value", () => {
    const histogram: Histogram8 = buildHistogram();
    expect(histogram.maxValue).equal(0);
  });
});

describe("Histogram internal indexes", () => {
  test("should compute count index when value in first bucket", () => {
    // given
    const histogram: Histogram8 = buildHistogram();
    // when
    const index = histogram.countsArrayIndex(2000); // 2000 < 2048
    expect(index).equal(2000);
  });

  test("should compute count index when value outside first bucket", () => {
    // given
    const histogram: Histogram8 = buildHistogram();
    // when
    const index = histogram.countsArrayIndex(2050); // 2050 > 2048
    // then
    expect(index).equal(2049);
  });

  test("should compute count index taking into account lowest discernible value", () => {
    // given
    const histogram = new Histogram8(
      2000,
      9007199254740991, // Number.MAX_SAFE_INTEGER
      2
    );
    // when
    const index = histogram.countsArrayIndex(16000);
    // then
    expect(index).equal(15);
  });
});

describe("Histogram computing statistics", () => {
  test("should compute mean value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect<f64>(histogram.getMean()).equal(50);
  });

  test("should compute standard deviation", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect<f64>(histogram.getStdDeviation()).greaterThan(20.4124);
    expect<f64>(histogram.getStdDeviation()).lessThan(20.4125);
  });

  test("should compute percentiles", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(123456);
    histogram.recordValue(122777);
    histogram.recordValue(127);
    histogram.recordValue(42);
    // when
    const percentileValue = histogram.getValueAtPercentile(99.9);
    // then
    expect<u64>(percentileValue).greaterThan(123456 - 1000);
    expect<u64>(percentileValue).lessThan(123456 + 1000);
  });

  test("should compute max value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(123);
    // then
    expect<u64>(histogram.maxValue).equal(123);
  });

  test("should compute min non zero value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(123);
    // then
    expect<u64>(histogram.minNonZeroValue).equal(123);
  });

  test("should compute percentile distribution", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    const expectedResult = `       Value     Percentile TotalCount 1/(1-Percentile)

      25.000 0.000000000000          1           1.00
      25.000 0.100000000000          1           1.11
      25.000 0.200000000000          1           1.25
      25.000 0.300000000000          1           1.43
      50.000 0.400000000000          2           1.67
      50.000 0.500000000000          2           2.00
      50.000 0.550000000000          2           2.22
      50.000 0.600000000000          2           2.50
      50.000 0.650000000000          2           2.86
      75.000 0.700000000000          3           3.33
      75.000 1.000000000000          3
#[Mean    =       50.000, StdDeviation   =       20.412]
#[Max     =       75.000, Total count    =            3]
#[Buckets =           43, SubBuckets     =         2048]
`;
    expect<string>(histogram.outputPercentileDistribution()).equal(
      expectedResult
    );
  });
});

describe("Histogram resize", () => {
  test("should not crash when autoresize on and value bigger than max", () => {
    // given
    const histogram = new Histogram8(1, 4096, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(900000);
    // then
    expect<u64>(histogram.totalCount).equal(1);
  });

  test("should compute percentiles after resize", () => {
    // given
    const histogram = new Histogram8(1, 4096, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(900000);
    histogram.recordValue(9000000);
    histogram.recordValue(9000000);
    histogram.recordValue(90000000);
    // then
    const medianValue = histogram.getValueAtPercentile(50);
    expect<f64>(Math.floor(<f64>medianValue / <f64>10000)).equal(900);
  });

  test("should update highest trackable value when resizing", () => {
    // given
    const histogram = new Histogram8(1, 4096, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(9000);
    // then
    expect(histogram.highestTrackableValue).greaterThan(4096);
  });
});

describe("Histogram clearing support", () => {
  test("should reset data in order to reuse histogram", () => {
    // given
    const histogram = buildHistogram();
    histogram.startTimeStampMsec = 42;
    histogram.endTimeStampMsec = 56;
    histogram.tag = "blabla";
    histogram.recordValue(1000);
    // when
    histogram.reset();
    // then
    expect(histogram.totalCount).equal(0);
    expect(histogram.startTimeStampMsec).equal(0);
    expect(histogram.endTimeStampMsec).equal(0);
    //expect(histogram.tag).equal(NO_TAG);
    expect(histogram.maxValue).equal(0);
    expect(histogram.minNonZeroValue).equal(U64.MAX_VALUE);
    expect(histogram.getValueAtPercentile(99.999)).equal(0);
  });
});

describe("Histogram correcting coordinated omissions", () => {
  test("should generate additional values when recording", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordSingleValueWithExpectedInterval(200, 100);
    // then
    expect(histogram.totalCount).equal(2);
    expect(histogram.minNonZeroValue).equal(100);
    expect(histogram.maxValue).equal(200);
  });

  test("should not generate additional values when recording without ommission", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordSingleValueWithExpectedInterval(99, 100);
    // then
    expect(histogram.totalCount).equal(1);
  });

  test("should generate additional values when correcting after recording", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(207);
    histogram.recordValue(207);
    // when
    const correctedHistogram = histogram.copyCorrectedForCoordinatedOmission(
      100
    );
    // then
    expect(correctedHistogram.totalCount).equal(4);
    expect(correctedHistogram.minNonZeroValue).equal(107);
    expect(correctedHistogram.maxValue).equal(207);
  });

  test("should generate additional values when correcting after recording bis", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(207);
    histogram.recordValue(207);
    // when
    const correctedHistogram = histogram.copyCorrectedForCoordinatedOmission(
      1000
    );
    // then
    expect(correctedHistogram.totalCount).equal(2);
    expect(correctedHistogram.minNonZeroValue).equal(207);
    expect(correctedHistogram.maxValue).equal(207);
  });
});

describe("Histogram add & subtract", () => {
  test("should add histograms of same size", () => {
    // given
    const histogram = buildHistogram();
    const histogram2 = new Histogram16(1, 256, 3);
    histogram.recordValue(42);
    histogram2.recordValue(158);
    // testwhen
    histogram.add<Storage<u16>, u16>(histogram2);
    // then
    expect(histogram.totalCount).equal(2);
    expect(histogram.getMean()).equal(100);
  });

  test("should add histograms of different sizes & precisions", () => {
    // given
    const histogram = buildHistogram();
    const histogram2 = new Histogram16(1, 1024, 3);
    histogram2.autoResize = true;
    histogram.recordValue(42000);
    histogram2.recordValue(1000);
    // when
    histogram.add<Storage<u16>, u16>(histogram2);
    // then
    expect(histogram.totalCount).equal(2);
    expect(Math.floor(histogram.getMean() / 100)).equal(215);
  });

  test("should be equal when another histogram is added then subtracted with same characteristics", () => {
    // given
    const histogram = buildHistogram();
    const histogram2 = buildHistogram();
    histogram.recordCountAtValue(2, 100);
    histogram2.recordCountAtValue(1, 100);
    histogram.recordCountAtValue(2, 200);
    histogram2.recordCountAtValue(1, 200);
    histogram.recordCountAtValue(2, 300);
    histogram2.recordCountAtValue(1, 300);
    const outputBefore = histogram.outputPercentileDistribution();
    // when
    histogram.add<Storage<u8>, u8>(histogram2);
    histogram.subtract<Storage<u8>, u8>(histogram2);
    // then
    expect(histogram.outputPercentileDistribution()).equal(outputBefore);
  });

  test("should be equal when another histogram of lower precision is added then subtracted", () => {
    // given
    const histogram = new Histogram8(1, 1000000000, 5);
    const histogram2 = new Histogram8(1, 1000000000, 3);
    histogram.recordValue(10);
    histogram2.recordValue(100000);
    // when
    const outputBefore = histogram.outputPercentileDistribution();
    histogram.add<Storage<u8>, u8>(histogram2);
    histogram.subtract<Storage<u8>, u8>(histogram2);
    // then
    expect(histogram.outputPercentileDistribution()).equal(outputBefore);
  });
});

describe("Packed Histogram", () => {
  test("should compute percentiles as the non packed version", () => {
    // given
    const packedHistogram = new PackedHistogram(
      1,
      9007199254740991, // Number.MAX_SAFE_INTEGER
      3
    );
    const histogram = new Histogram64(
      1,
      9007199254740991, // Number.MAX_SAFE_INTEGER
      3
    );

    // when
    histogram.recordValue(2199023255552);
    packedHistogram.recordValue(2199023255552);

    // then
    expect<u64>(packedHistogram.getValueAtPercentile(90)).equal(
      histogram.getValueAtPercentile(90)
    );
  });
});
