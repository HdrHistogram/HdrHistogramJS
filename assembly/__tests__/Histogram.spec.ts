import { Histogram8 } from "../Histogram";

const buildHistogram = (): Histogram8 =>
  new Histogram8(
    1,
    9007199254740991, // Number.MAX_SAFE_INTEGER
    3
  );

describe("Histogram", () => {
  it("should be instantiable", () => {
    const h = buildHistogram();
    h.autoResize;
    expect<bool>(h.autoResize).toBe(false);
  });
});

describe("Histogram initialization", () => {
  it("should set sub bucket size", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<u64>(histogram.subBucketCount).toBe(2048);
  });

  it("should set resize to false when max value specified", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<bool>(histogram.autoResize).toBe(false);
  });

  it("should compute counts array length", () => {
    const histogram: Histogram8 = buildHistogram();
    expect<usize>(histogram.countsArrayLength).toBe(45056);
  });
  it("should compute bucket count", () => {
    const histogram: Histogram8 = buildHistogram();
    expect(histogram.bucketCount).toBe(43);
  });

  it("should set max value", () => {
    const histogram: Histogram8 = buildHistogram();
    expect(histogram.maxValue).toBe(0);
  });
});

describe("Histogram internal indexes", () => {
  it("should compute count index when value in first bucket", () => {
    // given
    const histogram: Histogram8 = buildHistogram();
    // when
    const index = histogram.countsArrayIndex(2000); // 2000 < 2048
    expect(index).toBe(2000);
  });

  it("should compute count index when value outside first bucket", () => {
    // given
    const histogram: Histogram8 = buildHistogram();
    // when
    const index = histogram.countsArrayIndex(2050); // 2050 > 2048
    // then
    expect(index).toBe(2049);
  });

  it("should compute count index taking into account lowest discernible value", () => {
    // given
    const histogram = new Histogram8(
      2000,
      9007199254740991, // Number.MAX_SAFE_INTEGER
      2
    );
    // when
    const index = histogram.countsArrayIndex(16000);
    // then
    expect(index).toBe(15);
  });
});

describe("Histogram computing statistics", () => {
  it("should compute mean value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect<f64>(histogram.getMean()).toBe(50);
  });

  it("should compute standard deviation", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect<f64>(histogram.getStdDeviation()).toBeGreaterThan(20.4124);
    expect<f64>(histogram.getStdDeviation()).toBeLessThan(20.4125);
  });

  it("should compute percentiles", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(123456);
    histogram.recordValue(122777);
    histogram.recordValue(127);
    histogram.recordValue(42);
    // when
    const percentileValue = histogram.getValueAtPercentile(99.9);
    // then
    expect<u64>(percentileValue).toBeGreaterThan(123456 - 1000);
    expect<u64>(percentileValue).toBeLessThan(123456 + 1000);
  });

  it("should compute max value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(123);
    // then
    expect<u64>(histogram.maxValue).toBe(123);
  });

  it("should compute min non zero value", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordValue(123);
    // then
    expect<u64>(histogram.minNonZeroValue).toBe(123);
  });

  it("should compute percentile distribution", () => {
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
    expect<string>(histogram.outputPercentileDistribution()).toBe(
      expectedResult
    );
  });
});

describe("Histogram resize", () => {
  it("should not crash when autoresize on and value bigger than max", () => {
    expect(() => {
      // given
      const histogram = new Histogram8(1, 4096, 3);
      histogram.autoResize = true;
      // when
      histogram.recordValue(900000);
      // then
      log<u64>(histogram.totalCount);
    }).not.toThrow();
  });

  it("should compute percentiles after resize", () => {
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
    expect<f64>(Math.floor(<f64>medianValue / <f64>10000)).toBe(900);
  });

  it("should update highest trackable value when resizing", () => {
    // given
    const histogram = new Histogram8(1, 4096, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(9000);
    // then
    expect(histogram.highestTrackableValue).toBeGreaterThan(4096);
  });
});

describe("Histogram clearing support", () => {
  it("should reset data in order to reuse histogram", () => {
    // given
    const histogram = buildHistogram();
    histogram.startTimeStampMsec = 42;
    histogram.endTimeStampMsec = 56;
    histogram.tag = "blabla";
    histogram.recordValue(1000);
    // when
    histogram.reset();
    // then
    expect(histogram.totalCount).toBe(0);
    expect(histogram.startTimeStampMsec).toBe(0);
    expect(histogram.endTimeStampMsec).toBe(0);
    //expect(histogram.tag).toBe(NO_TAG);
    expect(histogram.maxValue).toBe(0);
    expect(histogram.minNonZeroValue).toBe(U64.MAX_VALUE);
    expect(histogram.getValueAtPercentile(99.999)).toBe(0);
  });
});

describe("Histogram correcting coordinated omissions", () => {
  it("should generate additional values when recording", () => {
    // given
    const histogram = buildHistogram();
    // when
    histogram.recordSingleValueWithExpectedInterval(207, 100);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(histogram.minNonZeroValue).toBe(107);
    expect(histogram.maxValue).toBe(207);
  });

  it("should generate additional values when correcting after recording", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(207);
    histogram.recordValue(207);
    // when
    const correctedHistogram = histogram.copyCorrectedForCoordinatedOmission(
      100
    );
    // then
    expect(correctedHistogram.totalCount).toBe(4);
    expect(correctedHistogram.minNonZeroValue).toBe(107);
    expect(correctedHistogram.maxValue).toBe(207);
  });

  it("should generate additional values when correcting after recording bis", () => {
    // given
    const histogram = buildHistogram();
    histogram.recordValue(207);
    histogram.recordValue(207);
    // when
    const correctedHistogram = histogram.copyCorrectedForCoordinatedOmission(
      1000
    );
    // then
    expect(correctedHistogram.totalCount).toBe(2);
    expect(correctedHistogram.minNonZeroValue).toBe(207);
    expect(correctedHistogram.maxValue).toBe(207);
  });
});

describe("Histogram add & substract", () => {
  it("should add histograms of same size", () => {
    // given
    const histogram = buildHistogram();
    const histogram2 = buildHistogram();
    histogram.recordValue(42);
    histogram2.recordValue(158);
    // when
    histogram.add(histogram2);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(histogram.getMean()).toBe(100);
  });
});
