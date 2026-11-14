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

// Unsorted, possibly repeated, including the edges (0, 100, above 100).
const percentilesArb = fc.array(
  fc.oneof(
    fc.constantFrom(0, 50, 75, 97.5, 99, 99.9, 99.99, 99.999, 100, 150),
    fc.double({ min: 0, max: 100, noNaN: true })
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
  ({ build }) => {
    beforeAll(initWebAssembly);

    it("matches getValueAtPercentile for each requested percentile", () => {
      fc.assert(
        fc.property(recordsArb, percentilesArb, (records, percentiles) => {
          const histogram = fill(build(), records);
          try {
            const expected = percentiles.map((p) =>
              histogram.getValueAtPercentile(p)
            );
            expect(histogram.getValuesAtPercentiles(percentiles)).toEqual(
              expected
            );
          } finally {
            histogram.destroy();
          }
        }),
        runnerOptions
      );
    });

    it("returns an empty array for an empty list", () => {
      const histogram = fill(build(), [{ value: 42, count: 3 }]);
      expect(histogram.getValuesAtPercentiles([])).toEqual([]);
      histogram.destroy();
    });

    it("returns 0 for every percentile of an empty histogram", () => {
      const histogram = build();
      expect(histogram.getValuesAtPercentiles([0, 50, 99.9, 100])).toEqual([
        0, 0, 0, 0,
      ]);
      histogram.destroy();
    });

    it("keeps the input order for unsorted and repeated percentiles", () => {
      const histogram = fill(
        build(),
        Array.from({ length: 100 }, (_, i) => ({ value: i + 1, count: 1 }))
      );
      expect(histogram.getValuesAtPercentiles([99, 50, 99, 0, 100])).toEqual([
        99, 50, 99, 1, 100,
      ]);
      histogram.destroy();
    });

    it("truncates percentiles above 100 to 100", () => {
      const histogram = fill(build(), [
        { value: 10, count: 1 },
        { value: 1000, count: 1 },
      ]);
      const [above, top] = histogram.getValuesAtPercentiles([150, 100]);
      expect(above).toBe(top);
      expect(top).toBe(histogram.getValueAtPercentile(100));
      histogram.destroy();
    });

    it("returns 0 for a NaN percentile and still answers the others", () => {
      const histogram = fill(build(), [{ value: 50, count: 10 }]);
      expect(histogram.getValuesAtPercentiles([NaN, 50])).toEqual([
        0,
        histogram.getValueAtPercentile(50),
      ]);
      histogram.destroy();
    });

    it("summary values are the per-percentile values, rounded", () => {
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
