import Histogram from "./PackedHistogram";
import Float64Histogram from "./Float64Histogram";
import Int32Histogram from "./Int32Histogram";
import { build } from "./index";
import { initWebAssembly } from "./wasm";

// A few hundred values spread over the whole range: most of the counts array
// is empty, which is what the packed representation is made for.
const sparseValues = (count: number, seed: number) => {
  const values: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    values.push(1 + Math.floor((state / 4294967296) * 2 ** 52));
  }
  return values;
};

const PERCENTILES = [0, 1, 25, 50, 75, 90, 99, 99.9, 99.99, 100];

describe("Sparse packed histogram vs its flat counterpart", () => {
  const buildPair = (values: number[]) => {
    const packed = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    const flat = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    values.forEach((value) => {
      packed.recordValue(value);
      flat.recordValue(value);
    });
    return { packed, flat };
  };

  const expectSameStatistics = (packed: Histogram, flat: Int32Histogram) => {
    expect(packed.totalCount).toBe(flat.totalCount);
    expect(packed.maxValue).toBe(flat.maxValue);
    expect(packed.minNonZeroValue).toBe(flat.minNonZeroValue);
    PERCENTILES.forEach((percentile) => {
      expect(packed.getValueAtPercentile(percentile)).toBe(
        flat.getValueAtPercentile(percentile)
      );
    });
  };

  it("should compute the same percentiles", () => {
    const { packed, flat } = buildPair(sparseValues(300, 1));
    expectSameStatistics(packed, flat);
  });

  it("should compute the same percentiles with counts spanning several bytes", () => {
    const packed = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    const flat = new Float64Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    sparseValues(50, 2).forEach((value) => {
      packed.recordValue(value);
      flat.recordValue(value);
    });
    [256, 65536, 2 ** 24, 2 ** 32].forEach((count, i) => {
      packed.recordValueWithCount(1000 * (i + 1), count);
      flat.recordValueWithCount(1000 * (i + 1), count);
    });
    expect(packed.totalCount).toBe(flat.totalCount);
    PERCENTILES.forEach((percentile) => {
      expect(packed.getValueAtPercentile(percentile)).toBe(
        flat.getValueAtPercentile(percentile)
      );
    });
  });

  it("should encode to the same bytes", async () => {
    const { packed, flat } = buildPair(sparseValues(300, 3));
    expect(await packed.encodeIntoCompressedBase64()).toBe(
      await flat.encodeIntoCompressedBase64()
    );
  });

  it("should encode to the same bytes once counts were set back to zero", async () => {
    const { packed, flat } = buildPair(sparseValues(300, 4));
    const removed = sparseValues(300, 4).filter((_, i) => i % 3 === 0);
    const other = buildPair(removed);
    packed.subtract(other.packed);
    flat.subtract(other.flat);
    expectSameStatistics(packed, flat);
    expect(await packed.encodeIntoCompressedBase64()).toBe(
      await flat.encodeIntoCompressedBase64()
    );
  });

  it("should add and subtract like its flat counterpart", () => {
    const { packed, flat } = buildPair(sparseValues(300, 5));
    const other = buildPair(sparseValues(200, 6));
    // the other max above this one's max: it becomes the max, then gets removed
    other.packed.recordValue(2 ** 52 + 12345);
    other.flat.recordValue(2 ** 52 + 12345);

    packed.add(other.packed);
    flat.add(other.flat);
    expectSameStatistics(packed, flat);

    packed.subtract(other.packed);
    flat.subtract(other.flat);
    expectSameStatistics(packed, flat);
  });

  it("should add histograms of different layouts like its flat counterpart", () => {
    const { packed, flat } = buildPair(sparseValues(300, 7));
    const otherPacked = new Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    const otherFlat = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    sparseValues(200, 8).forEach((value) => {
      otherPacked.recordValue(value);
      otherFlat.recordValue(value);
    });
    packed.add(otherPacked);
    flat.add(otherFlat);
    expectSameStatistics(packed, flat);
    flat.add(otherPacked); // a packed source into a flat destination
    packed.add(otherFlat);
    expectSameStatistics(packed, flat);
  });

  it("should re-establish tracking values after a reset and a resize", () => {
    const packed = new Histogram(1, 2, 3);
    const flat = new Int32Histogram(1, 2, 3);
    packed.autoResize = true;
    flat.autoResize = true;
    sparseValues(100, 9).forEach((value) => {
      packed.recordValue(value);
      flat.recordValue(value);
    });
    expectSameStatistics(packed, flat);
    packed.reset();
    flat.reset();
    sparseValues(100, 10).forEach((value) => {
      packed.recordValue(value);
      flat.recordValue(value);
    });
    expectSameStatistics(packed, flat);
  });
});

describe("Sparse WASM packed histogram vs the JS one", () => {
  beforeAll(() => initWebAssembly());

  it("should compute the same percentiles and encode to the same bytes", async () => {
    const values = sparseValues(300, 11);
    const wasmPacked = build({
      useWebAssembly: true,
      bitBucketSize: "packed",
      highestTrackableValue: Number.MAX_SAFE_INTEGER,
      autoResize: false,
    });
    const packed = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    values.forEach((value) => {
      wasmPacked.recordValue(value);
      packed.recordValue(value);
    });
    try {
      PERCENTILES.forEach((percentile) => {
        expect(wasmPacked.getValueAtPercentile(percentile)).toBe(
          packed.getValueAtPercentile(percentile)
        );
      });
      expect(await wasmPacked.encodeIntoCompressedBase64()).toBe(
        await packed.encodeIntoCompressedBase64()
      );
    } finally {
      wasmPacked.destroy();
    }
  });
});

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

    [1, 49026].forEach((v) => histogram.recordValue(v));

    // when
    histogram.reset();
    [7, 67, 42357, 805017].forEach((v) => {
      histogram.recordValue(v);
      histogram2.recordValue(v);
    });
    // then
    expect(histogram.getValueAtPercentile(5)).toBe(
      histogram2.getValueAtPercentile(5)
    );
  });

  it("should compute value outside first bucket with an error less than 1000", () => {
    // given
    const histogram = new Histogram(1, 123456, 2);
    histogram.recordValue(5234);
    histogram.recordValue(127);
    histogram.recordValue(42);
    // when
    const percentileValue = histogram.getValueAtPercentile(90);
    // then
    expect(Math.abs(percentileValue - 5234)).toBeLessThan(100);
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

  it("should record many large counts as the non packed version", () => {
    // given
    const histogram = new Histogram(1, 1000000000, 3);
    const histogram64 = new Float64Histogram(1, 1000000000, 3);

    // when
    for (let value = 1; value < 1000000000; value += 100000) {
      histogram.recordValueWithCount(value, value * 2 ** 20);
      histogram64.recordValueWithCount(value, value * 2 ** 20);
    }

    // then
    expect(histogram.totalCount).toBe(histogram64.totalCount);
    expect(histogram.getValueAtPercentile(50)).toBe(
      histogram64.getValueAtPercentile(50)
    );
    expect(histogram.getValueAtPercentile(99.9)).toBe(
      histogram64.getValueAtPercentile(99.9)
    );
  });
});

describe("Histogram clearing support", () => {
  it("should reset data in order to reuse histogram", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    const histogram2 = new Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.startTimeStampMsec = 42;
    histogram.endTimeStampMsec = 56;
    histogram.tag = "blabla";
    histogram.recordValue(10);
    histogram.recordValue(1000);
    histogram.recordValue(10000000);
    // when
    histogram.reset();
    // then
    expect(histogram.totalCount).toBe(0);
    expect(histogram.startTimeStampMsec).toBe(0);
    expect(histogram.endTimeStampMsec).toBe(0);
    //expect(histogram.tag).toBe(NO_TAG);
    expect(histogram.maxValue).toBe(0);
    expect(histogram.minNonZeroValue).toBe(Number.MAX_SAFE_INTEGER);
    expect(histogram.getValueAtPercentile(99.999)).toBe(0);
  });
});
