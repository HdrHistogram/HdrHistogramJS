import { build } from ".";
import JsHistogram from "./JsHistogram";
import { NO_TAG } from "./Histogram";
import Int32Histogram from "./Int32Histogram";
import { initWebAssembly, WasmHistogram, initWebAssemblySync } from "./wasm";
import Histogram from "./Histogram";
import { decodeFromCompressedBase64 } from './encoding';

class HistogramForTests extends JsHistogram {
  //constructor() {}

  clearCounts() {}

  incrementCountAtIndex(index: number): void {}

  incrementTotalCount(): void {}

  addToTotalCount(value: number) {}

  setTotalCount(totalCount: number) {}

  resize(newHighestTrackableValue: number): void {
    this.establishSize(newHighestTrackableValue);
  }

  addToCountAtIndex(index: number, value: number): void {}

  setCountAtIndex(index: number, value: number): void {}

  getTotalCount() {
    return 0;
  }

  getCountAtIndex(index: number): number {
    return 0;
  }

  protected _getEstimatedFootprintInBytes() {
    return 42;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    return this;
  }
}

describe("Histogram initialization", () => {
  let histogram: JsHistogram;
  beforeEach(() => {
    histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
  });

  it("should set sub bucket size", () => {
    expect(histogram.subBucketCount).toBe(2048);
  });

  it("should set resize to false when max value specified", () => {
    expect(histogram.autoResize).toBe(false);
  });

  it("should compute counts array length", () => {
    expect(histogram.countsArrayLength).toBe(45056);
  });

  it("should compute bucket count", () => {
    expect(histogram.bucketCount).toBe(43);
  });

  it("should set min non zero value", () => {
    expect(histogram.minNonZeroValue).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("should set max value", () => {
    expect(histogram.maxValue).toBe(0);
  });
});

describe("Histogram recording values", () => {
  it("should compute count index when value in first bucket", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    const index = histogram.countsArrayIndex(2000); // 2000 < 2048
    expect(index).toBe(2000);
  });

  it("should compute count index when value outside first bucket", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    const index = histogram.countsArrayIndex(2050); // 2050 > 2048
    // then
    expect(index).toBe(2049);
  });

  it("should compute count index taking into account lowest discernible value", () => {
    // given
    const histogram = new HistogramForTests(2000, Number.MAX_SAFE_INTEGER, 2);
    // when
    const index = histogram.countsArrayIndex(16000);
    // then
    expect(index).toBe(15);
  });

  it("should compute count index of a big value taking into account lowest discernible value", () => {
    // given
    const histogram = new HistogramForTests(2000, Number.MAX_SAFE_INTEGER, 2);
    // when
    const bigValue = Number.MAX_SAFE_INTEGER - 1;
    const index = histogram.countsArrayIndex(bigValue);
    // then
    expect(index).toBe(4735);
  });

  it("should update min non zero value", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123);
    // then
    expect(histogram.minNonZeroValue).toBe(123);
  });

  it("should update max value", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123);
    // then
    expect(histogram.maxValue).toBe(123);
  });

  it("should throw an error when value bigger than highest trackable value", () => {
    // given
    const histogram = new HistogramForTests(1, 4096, 3);
    // when then
    expect(() => histogram.recordValue(9000)).toThrowError();
  });

  it("should not throw an error when autoresize enable and value bigger than highest trackable value", () => {
    // given
    const histogram = new HistogramForTests(1, 4096, 3);
    histogram.autoResize = true;
    // when then
    expect(() => histogram.recordValue(9000)).not.toThrowError();
  });

  it("should increase counts array size when recording value bigger than highest trackable value", () => {
    // given
    const histogram = new HistogramForTests(1, 4096, 3);
    histogram.autoResize = true;
    // when
    histogram.recordValue(9000);
    // then
    expect(histogram.highestTrackableValue).toBeGreaterThan(9000);
  });
});

describe("Histogram computing statistics", () => {
  const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);

  it("should compute mean value", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect(histogram.mean).toBe(50);
  });

  it("should compute standard deviation", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    expect(histogram.stdDeviation).toBeGreaterThan(20.4124);
    expect(histogram.stdDeviation).toBeLessThan(20.4125);
  });

  it("should compute percentile distribution", () => {
    // given
    histogram.reset();
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
    expect(histogram.outputPercentileDistribution()).toBe(expectedResult);
  });

  it("should compute percentile distribution in csv format", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValue(25);
    histogram.recordValue(50);
    histogram.recordValue(75);
    // then
    const expectedResult = `"Value","Percentile","TotalCount","1/(1-Percentile)"
25.000,0.000000000000,1,1.00
25.000,0.100000000000,1,1.11
25.000,0.200000000000,1,1.25
25.000,0.300000000000,1,1.43
50.000,0.400000000000,2,1.67
50.000,0.500000000000,2,2.00
50.000,0.550000000000,2,2.22
50.000,0.600000000000,2,2.50
50.000,0.650000000000,2,2.86
75.000,0.700000000000,3,3.33
75.000,1.000000000000,3,Infinity
`;
    expect(
      histogram.outputPercentileDistribution(undefined, undefined, true)
    ).toBe(expectedResult);
  });

  it("should compute percentile distribution in JSON format with rounding according to number of significant digits", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValue(25042);
    histogram.recordValue(50042);
    histogram.recordValue(75042);
    // then
    const { summary } = histogram;
    expect(summary.p50).toEqual(50000);
  });
});

describe("Histogram correcting coordinated omissions", () => {
  const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);

  it("should generate additional values when recording", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValueWithExpectedInterval(207, 100);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(histogram.minNonZeroValue).toBe(107);
    expect(histogram.maxValue).toBe(207);
  });

  it("should generate additional values when correcting after recording", () => {
    // given
    histogram.reset();
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

  it("should not generate additional values when correcting after recording", () => {
    // given
    histogram.reset();
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

describe("WASM Histogram not initialized", () => {
  it("should throw a clear error message", () => {
    expect(() => build({ useWebAssembly: true })).toThrow(
      "WebAssembly is not ready yet"
    );
    expect(() => WasmHistogram.build()).toThrow("WebAssembly is not ready yet");
    expect(() => WasmHistogram.decode(null as any)).toThrow(
      "WebAssembly is not ready yet"
    );
  });
});

describe("WASM Histogram not happy path", () => {
  beforeEach(initWebAssemblySync);
  it("should throw a clear error message when used after destroy", () => {
    const destroyedHistogram = build({ useWebAssembly: true });
    destroyedHistogram.destroy();
    expect(() => destroyedHistogram.recordValue(42)).toThrow(
      "Cannot use a destroyed histogram"
    );
  });
  it("should not crash when displayed after destroy", () => {
    const destroyedHistogram = build({ useWebAssembly: true });
    destroyedHistogram.destroy();
    expect(destroyedHistogram + "").toEqual("Destroyed WASM histogram");
  });
  it("should throw a clear error message when added to a JS regular Histogram", () => {
    const wasmHistogram = build({ useWebAssembly: true });
    const jsHistogram = build({ useWebAssembly: false });
    expect(() => jsHistogram.add(wasmHistogram)).toThrow(
      "Cannot add a WASM histogram to a regular JS histogram"
    );
  });
  it("should throw a clear error message when trying to add a JS regular Histogram", () => {
    const wasmHistogram = build({ useWebAssembly: true });
    const jsHistogram = build({ useWebAssembly: false });
    expect(() => wasmHistogram.add(jsHistogram)).toThrow(
      "Cannot add a regular JS histogram to a WASM histogram"
    );
  });

  it("should throw a clear error message when substracted to a JS regular Histogram", () => {
    const wasmHistogram = build({ useWebAssembly: true });
    const jsHistogram = build({ useWebAssembly: false });
    expect(() => jsHistogram.subtract(wasmHistogram)).toThrow(
      "Cannot subtract a WASM histogram to a regular JS histogram"
    );
  });
  it("should throw a clear error message when trying to add a JS regular Histogram", () => {
    const wasmHistogram = build({ useWebAssembly: true });
    const jsHistogram = build({ useWebAssembly: false });
    expect(() => wasmHistogram.subtract(jsHistogram)).toThrow(
      "Cannot subtract a regular JS histogram to a WASM histogram"
    );
  });
});

describe("WASM estimated memory footprint", () => {
  let wasmHistogram: Histogram;
  beforeAll(initWebAssembly);
  afterEach(() => wasmHistogram.destroy());

  it("should be a little bit more than js footprint for packed histograms", () => {
    wasmHistogram = build({ useWebAssembly: true, bitBucketSize: "packed" });
    expect(wasmHistogram.estimatedFootprintInBytes).toBeGreaterThan(
      build({ bitBucketSize: "packed" }).estimatedFootprintInBytes
    );
  });
});

describe("WASM Histogram correcting coordinated omissions", () => {
  let histogram: Histogram;

  beforeAll(initWebAssembly);
  beforeEach(() => {
    histogram = build({ useWebAssembly: true });
  });
  afterEach(() => histogram.destroy());

  it("should generate additional values when recording", () => {
    // given
    histogram.reset();
    // when
    histogram.recordValueWithExpectedInterval(207, 100);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(histogram.minNonZeroValue).toBe(107);
    expect(histogram.maxValue).toBe(207);
  });

  it("should generate additional values when correcting after recording", () => {
    // given
    histogram.reset();
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

  it("should not generate additional values when correcting after recording", () => {
    // given
    histogram.reset();
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
  beforeAll(initWebAssembly);

  it("should add histograms of same size", () => {
    // given
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    const histogram2 = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.recordValue(42);
    histogram2.recordValue(158);
    // when
    histogram.add(histogram2);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(histogram.mean).toBe(100);
  });

  it("should add histograms of different sizes & precisions", () => {
    // given
    const histogram = build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 1024,
      autoResize: true,
      numberOfSignificantValueDigits: 2,
      bitBucketSize: "packed",
      useWebAssembly: true,
    });
    const histogram2 = build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 1024,
      autoResize: true,
      numberOfSignificantValueDigits: 3,
      bitBucketSize: 32,
      useWebAssembly: true,
    });
    //histogram2.autoResize = true;
    histogram.recordValue(42000);
    histogram2.recordValue(1000);
    // when
    histogram.add(histogram2);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(Math.floor(histogram.mean / 100)).toBe(215);
  });

  it("should add histograms of different sizes", () => {
    // given
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    const histogram2 = new Int32Histogram(1, 1024, 2);
    histogram2.autoResize = true;
    histogram.recordValue(42000);
    histogram2.recordValue(1000);
    // when
    histogram.add(histogram2);
    // then
    expect(histogram.totalCount).toBe(2);
    expect(Math.floor(histogram.mean / 100)).toBe(215);
  });

  it("should be equal when another histogram of lower precision is added then subtracted", () => {
    // given
    const histogram = build({ numberOfSignificantValueDigits: 5 });
    const histogram2 = build({ numberOfSignificantValueDigits: 3 });
    histogram.recordValue(100);
    histogram2.recordValue(42000);
    // when
    const before = histogram.summary;
    histogram.add(histogram2);
    histogram.subtract(histogram2);
    // then
    expect(histogram.summary).toStrictEqual(before);
  });

  it("should update percentiles when another histogram of same characteristics is substracted", () => {
    // given
    const histogram = build({ numberOfSignificantValueDigits: 3 });
    const histogram2 = build({ numberOfSignificantValueDigits: 3 });
    histogram.recordValueWithCount(100, 2);
    histogram2.recordValueWithCount(100, 1);
    histogram.recordValueWithCount(200, 2);
    histogram2.recordValueWithCount(200, 1);
    histogram.recordValueWithCount(300, 2);
    histogram2.recordValueWithCount(300, 1);
    // when
    histogram.subtract(histogram2);
    // then
    expect(histogram.getValueAtPercentile(50)).toBe(200);
  });
});

describe("Histogram clearing support", () => {
  beforeAll(initWebAssembly);

  it("should reset data in order to reuse histogram", () => {
    // given
    const histogram = build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: Number.MAX_SAFE_INTEGER,
      numberOfSignificantValueDigits: 5,
      useWebAssembly: true,
    });
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
    expect(histogram.tag).toBe(NO_TAG);
    expect(histogram.maxValue).toBe(0);
    expect(histogram.minNonZeroValue).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(histogram.getValueAtPercentile(99.999)).toBe(0);
  });

  it("should behave as new when reseted", () => {
    // given
    const histogram = build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 15000,
      numberOfSignificantValueDigits: 2,
    });
    const histogram2 = build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 15000,
      numberOfSignificantValueDigits: 2,
    });
    histogram.recordValue(1);
    histogram.recordValue(100);
    histogram.recordValue(2000);
    histogram.reset();
    // when
    histogram.recordValue(1000);
    histogram2.recordValue(1000);

    // then
    expect(histogram.mean).toBe(histogram2.mean);
  });
});

describe("WASM Histogram bucket size overflow", () => {
  beforeAll(initWebAssembly);
  [8 as const, 16 as const].forEach(
    (bitBucketSize) => {
      const maxBucketSize = (2 ** bitBucketSize) - 1;
      it(`should fail when recording more than ${maxBucketSize} times the same value`, () => {
        //given
        const wasmHistogram = build({ useWebAssembly: true, bitBucketSize });

        //when //then
        try {
          let i = 0;
          for (i; i <= maxBucketSize; i++) {
            wasmHistogram.recordValue(1); 
          }
          fail(`should have failed due to ${bitBucketSize}bits integer overflow (bucket size : ${i})`);
        } catch(e) {
          //ok
        } finally {
          wasmHistogram.destroy();
        }
      });

      it(`should fail when adding two histograms when the same bucket count addition is greater than ${bitBucketSize}bits max integer value`, () => {
        //given
        const histogram1 = build({ useWebAssembly: true, bitBucketSize });
        histogram1.recordValueWithCount(1, maxBucketSize);
        const histogram2 = build({ useWebAssembly: true, bitBucketSize });
        histogram2.recordValueWithCount(1, maxBucketSize);
        
        //when //then
        expect(() => histogram2.add(histogram1)).toThrow();

        histogram1.destroy();
        histogram2.destroy();
      });
    });

    it("should fail when decoding an Int32 histogram with one bucket count greater than 16bits in a smaller histogram", () => {
      //given
      const int32Histogram = build({ useWebAssembly: true, bitBucketSize: 32 }) as WasmHistogram;
      int32Histogram.recordValueWithCount(1, 2**32 - 1);
      const encodedInt32Histogram = int32Histogram.encodeIntoCompressedBase64();
      
      //when //then
      expect(() => decodeFromCompressedBase64(encodedInt32Histogram, 16, true)).toThrow();
      int32Histogram.destroy();
    });
});

