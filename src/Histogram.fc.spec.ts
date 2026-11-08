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
import Histogram, { BitBucketSize } from "./Histogram";
import JsHistogram from "./JsHistogram";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
  verbose: true,
};

describe("Histogram percentile computation", () => {
  beforeAll(initWebAssembly);

  const numberOfSignificantValueDigits = 3;
  [true, false].forEach((useWebAssembly) =>
    [16, "packed"].forEach((bitBucketSize: BitBucketSize) =>
      it(`Histogram ${bitBucketSize} (wasm: ${useWebAssembly}) should be accurate according to its significant figures`, async () => {
        await initWebAssembly();

        fc.assert(
          fc.property(arbData(2000), (numbers) => {
            const histogram = hdr.build({
              bitBucketSize,
              numberOfSignificantValueDigits,
              useWebAssembly,
            });
            numbers.forEach((n) => histogram.recordValue(n));
            const actual = quantile(numbers, 90);
            const got = histogram.getValueAtPercentile(90);
            const relativeError = Math.abs(1 - got / actual);
            const variation = Math.pow(10, -numberOfSignificantValueDigits);
            histogram.destroy();
            return relativeError < variation;
          }),
          runnerOptions
        );
      })
    )
  );
});

describe("Histogram percentile computation (packed vs classic)", () => {
  const numberOfSignificantValueDigits = 3;
  const classicHistogram = hdr.build({
    numberOfSignificantValueDigits,
  });
  const histogram = hdr.build({
    numberOfSignificantValueDigits,
    bitBucketSize: "packed",
    useWebAssembly: false,
  });

  it(`should be accurate according to its significant figures`, () => {
    fc.assert(
      fc.property(arbData(5), (numbers) => {
        histogram.reset();
        classicHistogram.reset();
        numbers.forEach((n) => histogram.recordValue(n));
        numbers.forEach((n) => classicHistogram.recordValue(n));
        const actual = classicHistogram.getValueAtPercentile(90);
        const got = histogram.getValueAtPercentile(90);
        return actual === got;
      }),
      runnerOptions
    );
  });
});

describe("Histogram percentile computation with CO correction (wasm vs js)", () => {
  beforeAll(initWebAssembly);

  let jsHistogram: Histogram;
  let wasmHistogram: Histogram;

  beforeEach(() => {
    jsHistogram = hdr.build({
      useWebAssembly: false,
    });
    wasmHistogram = hdr.build({
      useWebAssembly: true,
    });
  });

  afterEach(() => {
    jsHistogram.destroy();
    wasmHistogram.destroy();
  });

  it(`should be accurate according to its significant figures`, () => {
    fc.assert(
      fc.property(arbData(1, 100 * 1000), (numbers) => {
        jsHistogram.reset();
        wasmHistogram.reset();
        numbers.forEach((n) => {
          jsHistogram.recordValueWithExpectedInterval(n, 1000);
        });
        numbers.forEach((n) => {
          wasmHistogram.recordValueWithExpectedInterval(n, 1000);
        });
        const js = jsHistogram.getValueAtPercentile(90);
        const wasm = wasmHistogram.getValueAtPercentile(90);
        const relativeError = Math.abs(1 - js / wasm);
        const variation = Math.pow(10, -3);
        if (relativeError >= variation) {
          console.log({ js, wasm });
        }
        return relativeError < variation;
      }),
      runnerOptions
    );
  });
});

describe("Histogram encoding/decoding", () => {
  beforeAll(initWebAssembly);

  const numberOfSignificantValueDigits = 3;
  [true, false].forEach((useWebAssembly) =>
    [8, 16, 32, 64, "packed"].forEach((bitBucketSize: BitBucketSize) => {
      it(`Histogram ${bitBucketSize} (wasm: ${useWebAssembly}) should keep all data after an encoding/decoding roundtrip`, async () => {
        await fc.assert(
          fc.asyncProperty(arbData(1), fc.double({ min: 50, max: 100, noNaN: true }), async (numbers, percentile) => {
            const histogram = hdr.build({
              bitBucketSize,
              numberOfSignificantValueDigits,
              useWebAssembly,
            });
            numbers.forEach((n) => histogram.recordValue(n));
            const encodedHistogram = await hdr.encodeIntoCompressedBase64(histogram);
            const decodedHistogram = await hdr.decodeFromCompressedBase64(
              encodedHistogram
            );
            const actual = histogram.getValueAtPercentile(percentile);
            const got = decodedHistogram.getValueAtPercentile(percentile);
            histogram.destroy();
            decodedHistogram.destroy();
            return actual === got;
          }),
          runnerOptions
        );
      });
    })
  );
});

describe("Histogram scans bounded by recorded min and max (vs brute force scan)", () => {
  beforeAll(initWebAssembly);

  // Reference implementations walking every counts array index, as the
  // histogram did before the scans were bounded by minNonZeroValue / maxValue.
  const bruteForceValueAtPercentile = (
    histogram: JsHistogram,
    percentile: number
  ) => {
    const countAtPercentile = Math.max(
      Math.ceil((Math.min(percentile, 100) / 100) * histogram.totalCount),
      1
    );
    let total = 0;
    for (let i = 0; i < histogram.countsArrayLength; i++) {
      total += histogram.getCountAtIndex(i);
      if (total >= countAtPercentile) {
        const value = histogram.valueFromIndex(i);
        return percentile === 0
          ? histogram.lowestEquivalentValue(value)
          : histogram.highestEquivalentValue(value);
      }
    }
    return 0;
  };

  const bruteForceRecordedValues = (histogram: JsHistogram) => {
    const recorded: { value: number; count: number }[] = [];
    for (let i = 0; i < histogram.countsArrayLength; i++) {
      const count = histogram.getCountAtIndex(i);
      if (count !== 0) {
        recorded.push({
          value: histogram.highestEquivalentValue(histogram.valueFromIndex(i)),
          count,
        });
      }
    }
    return recorded;
  };

  const iteratedRecordedValues = (histogram: JsHistogram) => {
    const recorded: { value: number; count: number }[] = [];
    const iterator = histogram.recordedValuesIterator;
    iterator.reset();
    while (iterator.hasNext()) {
      const { valueIteratedTo, countAtValueIteratedTo } = iterator.next();
      recorded.push({ value: valueIteratedTo, count: countAtValueIteratedTo });
    }
    return recorded;
  };

  // Zeros (index 0), small values and values spread over the whole range.
  const arbValue = fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 2, arbitrary: fc.integer({ min: 1, max: 5000 }) },
    {
      weight: 2,
      arbitrary: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    }
  );
  const arbValues = fc.array(arbValue, { minLength: 0, maxLength: 40 });
  const arbPercentile = fc.oneof(
    fc.constant(0),
    fc.constant(100),
    fc.double({ min: 0, max: 100, noNaN: true })
  );

  [32, "packed"].forEach((bitBucketSize: BitBucketSize) =>
    [1, 1000].forEach((lowestDiscernibleValue) => {
      const buildJs = () =>
        hdr.build({
          bitBucketSize,
          lowestDiscernibleValue,
          highestTrackableValue: 2 * lowestDiscernibleValue,
          autoResize: true,
          numberOfSignificantValueDigits: 3,
          useWebAssembly: false,
        }) as JsHistogram;

      it(`Histogram ${bitBucketSize} (lowestDiscernibleValue ${lowestDiscernibleValue}) should compute the same percentiles and recorded values as a full scan`, () => {
        fc.assert(
          fc.property(arbValues, arbPercentile, (values, percentile) => {
            const histogram = buildJs();
            values.forEach((v) => histogram.recordValue(v));
            expect(histogram.getValueAtPercentile(percentile)).toBe(
              bruteForceValueAtPercentile(histogram, percentile)
            );
            expect(iteratedRecordedValues(histogram)).toStrictEqual(
              bruteForceRecordedValues(histogram)
            );
          }),
          runnerOptions
        );
      });

      it(`Histogram ${bitBucketSize} (lowestDiscernibleValue ${lowestDiscernibleValue}) should compute the same percentiles as a full scan after subtracting`, () => {
        fc.assert(
          fc.property(
            arbValues,
            fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
            arbPercentile,
            (values, subtracted, percentile) => {
              const histogram = buildJs();
              const other = buildJs();
              values.forEach((v, i) => {
                histogram.recordValue(v);
                if (subtracted[i]) {
                  other.recordValue(v);
                }
              });
              histogram.subtract(other);
              expect(histogram.getValueAtPercentile(percentile)).toBe(
                bruteForceValueAtPercentile(histogram, percentile)
              );
              expect(iteratedRecordedValues(histogram)).toStrictEqual(
                bruteForceRecordedValues(histogram)
              );
            }
          ),
          runnerOptions
        );
      });
    })
  );
});

const arbData = (size: number, max: number = Number.MAX_SAFE_INTEGER) =>
  fc.array(fc.integer({ min: 1, max }), { minLength: size, maxLength: size });

// reference implementation
const quantile = (inputData: number[], percentile: number) => {
  const data = [...inputData].sort((a, b) => a - b);
  const index = (percentile / 100) * (data.length - 1);
  let result: number;
  if (Math.floor(index) === index) {
    result = data[index];
  } else {
    const i = Math.floor(index);
    const fraction = index - i;
    result = data[i] + (data[i + 1] - data[i]) * fraction;
  }
  return result;
};
