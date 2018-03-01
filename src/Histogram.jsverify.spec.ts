/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import { expect } from "chai";
import * as jsc from "jsverify";
import * as hdr from "./index";

const runFromStryker = __dirname.includes("stryker");

const checkOptions = {
  rngState: "0559a70d12fe8436cb",
  tests: runFromStryker ? 10 : 1000
};

describe("Histogram percentile computation", () => {
  it("should be accurate according to its significant figures", () => {
    const numberOfSignificantValueDigits = 3;
    type BucketSize = 8 | 16 | 32 | 64;
    [8, 16, 32, 64].forEach((bitBucketSize: BucketSize) => {
      const histogram = hdr.build({
        bitBucketSize,
        numberOfSignificantValueDigits
      });
      const property = jsc.check(
        jsc.forall(arbData(100), numbers => {
          histogram.reset();
          numbers.forEach(n => histogram.recordValue(n));
          const actual = quantile(numbers, 90);
          const got = histogram.getValueAtPercentile(90);
          const relativeError = 1 - got / actual;
          const variation = Math.pow(10, -numberOfSignificantValueDigits);
          return relativeError < variation;
        }),
        checkOptions
      );
      expect(property).to.be.true;
    });
  });
});

describe("Histogram encoding/decoding", () => {
  it("should keep all data after an encoding/decoding roundtrip", () => {
    const numberOfSignificantValueDigits = 3;
    type BucketSize = 8 | 16 | 32 | 64;
    [8, 16, 32, 64].forEach((bitBucketSize: BucketSize) => {
      const property = jsc.check(
        jsc.forall(arbData(1), arbPercentiles(), (numbers, percentiles) => {
          const histogram = hdr.build({
            bitBucketSize,
            numberOfSignificantValueDigits
          });
          numbers.forEach(n => histogram.recordValue(n));
          const encodedHistogram = hdr.encodeIntoBase64String(histogram);
          const decodedHistogram = hdr.decodeFromCompressedBase64(
            encodedHistogram
          );
          return percentiles.every(percentile => {
            const actual = histogram.getValueAtPercentile(percentile);
            const got = decodedHistogram.getValueAtPercentile(percentile);
            return actual === got;
          });
        }),
        checkOptions
      );
      expect(property).to.be.true;
    });
  });
});

const arbData = (size: number): jsc.Arbitrary<number[]> => {
  const replicate = (
    n: number,
    g: jsc.Arbitrary<number>
  ): jsc.Arbitrary<number[]> => jsc.tuple(new Array(n).fill(g));

  return (jsc as any).nonshrink(
    replicate(
      size,
      jsc.oneof([
        // we want values with a high range
        jsc.integer(1, 100),
        jsc.integer(100000, Number.MAX_SAFE_INTEGER)
      ])
    )
  );
};

const arbPercentiles = () => jsc.array(jsc.number(50, 99.999));

// reference implementation
const quantile = (inputData: number[], percentile: number) => {
  const data = [...inputData].sort();
  const index = percentile / 100 * (data.length - 1);
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
