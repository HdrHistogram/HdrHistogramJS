/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import { expect } from "chai";
import * as fc from "fast-check";
import * as hdr from "./index";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
  verbose: true,
};

describe("Histogram percentile computation", () => {
  it("should be accurate according to its significant figures", () => {
    const numberOfSignificantValueDigits = 3;
    const histogram = hdr.build({
      numberOfSignificantValueDigits,
    });
    fc.assert(
      fc.property(arbData(2000), (numbers) => {
        histogram.reset();
        numbers.forEach((n) => histogram.recordValue(n));
        const actual = quantile(numbers, 90);
        const got = histogram.getValueAtPercentile(90);
        const relativeError = Math.abs(1 - got / actual);
        const variation = Math.pow(10, -numberOfSignificantValueDigits);
        return relativeError < variation;
      }),
      runnerOptions
    );
  });
});

describe("Histogram encoding/decoding", () => {
  it("should keep all data after an encoding/decoding roundtrip", () => {
    const numberOfSignificantValueDigits = 3;
    type BucketSize = 8 | 16 | 32 | 64;
    [8, 16, 32, 64].forEach((bitBucketSize: BucketSize) => {
      fc.assert(
        fc.property(arbData(1), fc.double(50, 100), (numbers, percentile) => {
          const histogram = hdr.build({
            bitBucketSize,
            numberOfSignificantValueDigits,
          }) as hdr.AbstractHistogram;
          numbers.forEach((n) => histogram.recordValue(n));
          const encodedHistogram = hdr.encodeIntoBase64String(histogram);
          const decodedHistogram = hdr.decodeFromCompressedBase64(
            encodedHistogram
          );
          const actual = histogram.getValueAtPercentile(percentile);
          const got = decodedHistogram.getValueAtPercentile(percentile);
          return actual === got;
        }),
        runnerOptions
      );
    });
  });
});

const arbData = (size: number) =>
  fc.array(fc.integer(1, Number.MAX_SAFE_INTEGER), size, size);

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
