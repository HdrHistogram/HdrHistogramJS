/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import * as fc from "fast-check";
import * as hdr from "./index";
import { initWebAssembly } from "./wasm";
import Histogram from "./Histogram";
import { keepSignificantDigits } from "./formatters";

const runFromStryker = __dirname.includes("stryker");
const runnerOptions = {
  numRuns: runFromStryker ? 10 : 300,
  verbose: true,
};

const numberOfSignificantValueDigits = 3;

const implementations: { name: string; build: () => Histogram }[] = [
  {
    name: "JS 32-bit",
    build: () =>
      hdr.build({ bitBucketSize: 32, numberOfSignificantValueDigits }),
  },
  {
    name: "JS packed",
    build: () =>
      hdr.build({ bitBucketSize: "packed", numberOfSignificantValueDigits }),
  },
  {
    name: "Float64",
    build: () =>
      new hdr.Float64Histogram(
        1,
        1_000_000_000,
        numberOfSignificantValueDigits
      ),
  },
  {
    name: "WASM 32-bit",
    build: () =>
      hdr.build({
        bitBucketSize: 32,
        numberOfSignificantValueDigits,
        useWebAssembly: true,
      }),
  },
  {
    name: "WASM packed",
    build: () =>
      hdr.build({
        bitBucketSize: "packed",
        numberOfSignificantValueDigits,
        useWebAssembly: true,
      }),
  },
];

// Values spread over a wide range, so the counts have long empty stretches
// (the bounded scan and the block skipping both get exercised).
const recordsArb = fc.array(
  fc.record({
    value: fc.integer({ min: 0, max: 5_000_000 }),
    count: fc.integer({ min: 1, max: 50 }),
  }),
  { maxLength: 300 }
);

// Unsorted, possibly repeated, including the edges (0, 100, above 100,
// negative, infinite).
const percentilesArb = fc.array(
  fc.oneof(
    fc.constantFrom(
      0,
      50,
      75,
      97.5,
      99,
      99.9,
      99.99,
      99.999,
      100,
      150,
      -1,
      -Infinity,
      Infinity
    ),
    fc.double({ min: -10, max: 110, noNaN: true })
  ),
  { maxLength: 20 }
);

type Record = { value: number; count: number };

const fill = (histogram: Histogram, records: Record[]) => {
  records.forEach(({ value, count }) =>
    histogram.recordValueWithCount(value, count)
  );
  return histogram;
};

describe.each(implementations)(
  "getValuesAtPercentiles on $name",
  ({ build, name }) => {
    beforeAll(initWebAssembly);

    it("should return 0 for NaN when the unit magnitude is not 0", () => {
      // given
      const useWebAssembly = name.startsWith("WASM");
      const bitBucketSize = name.endsWith("packed") ? "packed" : 32;
      const histogram = hdr.build({
        bitBucketSize,
        useWebAssembly,
        lowestDiscernibleValue: 1000,
        highestTrackableValue: 1_000_000,
        numberOfSignificantValueDigits,
      });
      histogram.recordValue(5000);
      // when
      const single = histogram.getValueAtPercentile(NaN);
      const values = histogram.getValuesAtPercentiles(NaN, 50);
      // then
      expect(single).toBe(0);
      expect(values).toEqual([0, histogram.getValueAtPercentile(50)]);
      histogram.destroy();
    });

    it.runIf(name.startsWith("WASM"))("should throw after destroy", () => {
      // given
      const histogram = fill(build(), [{ value: 42, count: 3 }]);
      histogram.destroy();
      // when
      const call = () => histogram.getValuesAtPercentiles(50);
      // then
      expect(call).toThrow();
    });

    it("should match getValueAtPercentile for each requested percentile", () => {
      fc.assert(
        fc.property(recordsArb, percentilesArb, (records, percentiles) => {
          const histogram = fill(build(), records);
          try {
            const expected = percentiles.map((p) =>
              histogram.getValueAtPercentile(p)
            );
            expect(histogram.getValuesAtPercentiles(...percentiles)).toEqual(
              expected
            );
          } finally {
            histogram.destroy();
          }
        }),
        runnerOptions
      );
    });

    it("should return an empty array when called without percentiles", () => {
      // given
      const histogram = fill(build(), [{ value: 42, count: 3 }]);
      // when
      const values = histogram.getValuesAtPercentiles();
      // then
      expect(values).toEqual([]);
      histogram.destroy();
    });

    it("should return 0 for every percentile of an empty histogram", () => {
      // given
      const histogram = build();
      // when
      const values = histogram.getValuesAtPercentiles(0, 50, 99.9, 100);
      // then
      expect(values).toEqual([0, 0, 0, 0]);
      histogram.destroy();
    });

    it("should keep the argument order for unsorted and repeated percentiles", () => {
      // given
      const histogram = fill(
        build(),
        Array.from({ length: 100 }, (_, i) => ({ value: i + 1, count: 1 }))
      );
      // when
      const values = histogram.getValuesAtPercentiles(99, 50, 99, 0, 100);
      // then
      expect(values).toEqual([99, 50, 99, 1, 100]);
      histogram.destroy();
    });

    it("should truncate percentiles above 100 to 100", () => {
      // given
      const histogram = fill(build(), [
        { value: 10, count: 1 },
        { value: 1000, count: 1 },
      ]);
      // when
      const [above, top] = histogram.getValuesAtPercentiles(150, 100);
      // then
      expect(above).toBe(top);
      expect(top).toBe(histogram.getValueAtPercentile(100));
      histogram.destroy();
    });

    it("should return 0 for a NaN percentile and still answer the others", () => {
      // given
      const histogram = fill(build(), [{ value: 50, count: 10 }]);
      // when
      const values = histogram.getValuesAtPercentiles(NaN, 50);
      // then
      expect(values).toEqual([0, histogram.getValueAtPercentile(50)]);
      histogram.destroy();
    });

    it("should treat negative and -Infinity percentiles as 0", () => {
      // given
      const histogram = fill(
        build(),
        Array.from({ length: 100 }, (_, i) => ({ value: i + 1, count: 1 }))
      );
      // when
      const values = histogram.getValuesAtPercentiles(
        -Infinity,
        50,
        -1,
        Infinity
      );
      // then
      expect(histogram.getValueAtPercentile(-1)).toBe(1);
      expect(histogram.getValueAtPercentile(-Infinity)).toBe(1);
      expect(values).toEqual([1, 50, 1, 100]);
      histogram.destroy();
    });

    it("should compute summary values equal to the per-percentile values, rounded", () => {
      fc.assert(
        fc.property(recordsArb, (records) => {
          const histogram = fill(build(), records);
          try {
            const round = keepSignificantDigits(numberOfSignificantValueDigits);
            const at = (p: number) => round(histogram.getValueAtPercentile(p));
            expect(histogram.summary).toEqual({
              p50: at(50),
              p75: at(75),
              p90: at(90),
              p97_5: at(97.5),
              p99: at(99),
              p99_9: at(99.9),
              p99_99: at(99.99),
              p99_999: at(99.999),
              max: histogram.maxValue,
              totalCount: histogram.totalCount,
            });
          } finally {
            histogram.destroy();
          }
        }),
        runnerOptions
      );
    });
  }
);
