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
import { encodeIntoCompressedBase64 } from "./encoding";

const runFromStryker = __dirname.includes("stryker");
const runnerOptions = {
  numRuns: runFromStryker ? 10 : 200,
  verbose: true,
};

const numberOfSignificantValueDigits = 3;

const implementations: {
  name: string;
  build: (autoResize?: boolean) => Histogram;
}[] = [
  {
    name: "JS 32-bit",
    build: (autoResize = false) =>
      hdr.build({
        bitBucketSize: 32,
        numberOfSignificantValueDigits,
        highestTrackableValue: 1_000_000_000,
        autoResize,
      }),
  },
  {
    name: "JS packed",
    build: (autoResize = false) =>
      hdr.build({
        bitBucketSize: "packed",
        numberOfSignificantValueDigits,
        highestTrackableValue: 1_000_000_000,
        autoResize,
      }),
  },
  {
    name: "Float64",
    build: (autoResize = false) => {
      const histogram = new hdr.Float64Histogram(
        1,
        1_000_000_000,
        numberOfSignificantValueDigits
      );
      histogram.autoResize = autoResize;
      return histogram;
    },
  },
  {
    name: "WASM 32-bit",
    build: (autoResize = false) =>
      hdr.build({
        bitBucketSize: 32,
        useWebAssembly: true,
        numberOfSignificantValueDigits,
        highestTrackableValue: 1_000_000_000,
        autoResize,
      }),
  },
  {
    name: "WASM packed",
    build: (autoResize = false) =>
      hdr.build({
        bitBucketSize: "packed",
        useWebAssembly: true,
        numberOfSignificantValueDigits,
        highestTrackableValue: 1_000_000_000,
        autoResize,
      }),
  },
];

const summarize = async (histogram: Histogram) => ({
  totalCount: histogram.totalCount,
  minNonZeroValue: histogram.minNonZeroValue,
  maxValue: histogram.maxValue,
  p50: histogram.getValueAtPercentile(50),
  p99: histogram.getValueAtPercentile(99),
  encoded: await encodeIntoCompressedBase64(histogram),
});

const errorMessageOf = (action: () => void): string => {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  return "no error";
};

describe("Histogram recordValues", () => {
  beforeAll(initWebAssembly);

  implementations.forEach(({ name, build }) => {
    describe(name, () => {
      it("should be equivalent to calling recordValue for each value", async () => {
        const values = [1, 2, 3, 100, 12345, 999_999, 42, 42, 42];
        const batch = build();
        const loop = build();

        batch.recordValues(values);
        values.forEach((value) => loop.recordValue(value));

        expect(await summarize(batch)).toEqual(await summarize(loop));
        expect(batch.totalCount).toBe(values.length);
      });

      it("should accept a Float64Array as well as a number array", async () => {
        const values = [7, 8, 9, 10_000, 500_000];
        const fromArray = build();
        const fromTypedArray = build();

        fromArray.recordValues(values);
        fromTypedArray.recordValues(Float64Array.from(values));

        expect(await summarize(fromTypedArray)).toEqual(
          await summarize(fromArray)
        );
      });

      it("should do nothing when given an empty input", async () => {
        const histogram = build();
        const reference = build();

        histogram.recordValues([]);
        histogram.recordValues(new Float64Array(0));

        expect(await summarize(histogram)).toEqual(await summarize(reference));
        expect(histogram.totalCount).toBe(0);
      });

      it("should grow the histogram when autoResize is on and a value is out of range", async () => {
        const batch = build(true);
        const loop = build(true);
        batch.highestTrackableValue = 1000;
        loop.highestTrackableValue = 1000;
        const values = [5, 10, 50_000, 3, 2_000_000];

        batch.recordValues(values);
        values.forEach((value) => loop.recordValue(value));

        expect(batch.totalCount).toBe(values.length);
        expect(batch.highestTrackableValue).toBe(loop.highestTrackableValue);
        expect(batch.maxValue).toBeGreaterThanOrEqual(2_000_000);
        expect(await summarize(batch)).toEqual(await summarize(loop));
      });

      it("should throw the same error as recordValue when a value is out of range and autoResize is off", () => {
        const outOfRange = 1_000_000_000_000;
        const expectedMessage = errorMessageOf(() =>
          build().recordValue(outOfRange)
        );
        expect(expectedMessage).not.toBe("no error");

        const histogram = build();
        const message = errorMessageOf(() =>
          histogram.recordValues([1, 2, outOfRange, 3])
        );

        expect(message).toBe(expectedMessage);
      });

      it("should keep the values recorded before an out of range value", () => {
        const histogram = build();
        const reference = build();

        expect(() =>
          histogram.recordValues([1, 2, 3, 1_000_000_000_000, 4])
        ).toThrow();
        [1, 2, 3].forEach((value) => reference.recordValue(value));

        expect(histogram.totalCount).toBe(3);
        expect(histogram.maxValue).toBe(reference.maxValue);
        expect(histogram.minNonZeroValue).toBe(1);
      });

      it("should handle an input large enough to grow wasm memory", async () => {
        const count = 200_000;
        const values = new Float64Array(count);
        for (let index = 0; index < count; index++) {
          values[index] = 1 + ((index * 7919) % 1_000_000);
        }
        const batch = build();
        const loop = build();

        batch.recordValues(values);
        for (let index = 0; index < count; index++) {
          loop.recordValue(values[index]);
        }

        expect(batch.totalCount).toBe(count);
        expect(await summarize(batch)).toEqual(await summarize(loop));
      });

      it("should match calling recordValue for each value (property)", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.integer({ min: 1, max: 1_000_000_000 }), {
              maxLength: 300,
            }),
            async (values) => {
              const batch = build();
              const loop = build();

              batch.recordValues(values);
              values.forEach((value) => loop.recordValue(value));

              expect(await summarize(batch)).toEqual(await summarize(loop));
            }
          ),
          runnerOptions
        );
      });
    });
  });
});
