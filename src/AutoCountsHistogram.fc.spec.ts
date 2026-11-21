import * as fc from "fast-check";
import AutoCountsHistogram from "./AutoCountsHistogram";
import Float64Histogram from "./Float64Histogram";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 300,
  verbose: true,
};

const HIGHEST = 1000000;

// Counts around each width boundary, plus small and mid-sized ones, so random
// sequences cross 2^8, 2^16 and 2^32 often.
const countArb = fc.oneof(
  fc.integer({ min: 1, max: 300 }),
  fc.constantFrom(255, 256, 257, 65535, 65536, 65537, 2 ** 32 - 1, 2 ** 32),
  fc.integer({ min: 1, max: 2 ** 33 })
);

const valueArb = fc.integer({ min: 1, max: HIGHEST });

type Op =
  | { kind: "record"; value: number; count: number }
  | { kind: "subtract"; value: number; count: number }
  | { kind: "add"; entries: Array<[number, number]> };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc
    .record({ value: valueArb, count: countArb })
    .map(({ value, count }) => ({ kind: "record", value, count }) as Op),
  fc
    .record({ value: valueArb, count: fc.integer({ min: 1, max: 1000 }) })
    .map(({ value, count }) => ({ kind: "subtract", value, count }) as Op),
  fc
    .array(fc.tuple(valueArb, countArb), { minLength: 1, maxLength: 5 })
    .map((entries) => ({ kind: "add", entries }) as Op)
);

describe("AutoCountsHistogram property: matches a Float64 twin", () => {
  it("keeps every count, total, extremes and percentiles equal under random operations", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const auto = new AutoCountsHistogram(1, HIGHEST, 3);
        const twin = new Float64Histogram(1, HIGHEST, 3);
        let previousWidth = auto.currentBitBucketSize;

        for (const op of ops) {
          if (op.kind === "record") {
            auto.recordValueWithCount(op.value, op.count);
            twin.recordValueWithCount(op.value, op.count);
          } else if (op.kind === "subtract") {
            // Only subtract what the twin holds, so no count goes negative.
            const index = twin.countsArrayIndex(op.value);
            if (twin.getCountAtIndex(index) < op.count) continue;
            auto.recordValueWithCount(op.value, -op.count);
            twin.recordValueWithCount(op.value, -op.count);
          } else {
            const other = new Float64Histogram(1, HIGHEST, 3);
            for (const [value, count] of op.entries) {
              other.recordValueWithCount(value, count);
            }
            const otherAuto = new AutoCountsHistogram(1, HIGHEST, 3);
            for (const [value, count] of op.entries) {
              otherAuto.recordValueWithCount(value, count);
            }
            auto.add(otherAuto);
            twin.add(other);
          }

          // Width only ever grows, and always holds the largest count.
          expect(auto.currentBitBucketSize).toBeGreaterThanOrEqual(
            previousWidth
          );
          previousWidth = auto.currentBitBucketSize;
        }

        expect(auto.totalCount).toBe(twin.totalCount);
        expect(auto.maxValue).toBe(twin.maxValue);
        expect(auto.minNonZeroValue).toBe(twin.minNonZeroValue);
        for (let i = 0; i < twin.countsArrayLength; i++) {
          expect(auto.getCountAtIndex(i)).toBe(twin.getCountAtIndex(i));
        }
        for (const p of [0, 50, 90, 99, 99.9, 100]) {
          expect(auto.getValueAtPercentile(p)).toBe(
            twin.getValueAtPercentile(p)
          );
        }
      }),
      runnerOptions
    );
  });
});
