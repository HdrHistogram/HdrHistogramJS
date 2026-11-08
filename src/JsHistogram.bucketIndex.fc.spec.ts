/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import * as fc from "fast-check";
import Int32Histogram from "./Int32Histogram";
import JsHistogram from "./JsHistogram";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
  verbose: true,
};

// Exact reference implementation of the Java original, computed with BigInt
// so that no floating point rounding is involved:
//   bucketIndex    = leadingZeroCountBase - Long.numberOfLeadingZeros(value | subBucketMask)
//   subBucketIndex = value >>> (bucketIndex + unitMagnitude)
//   countsIndex    = ((bucketIndex + 1) << subBucketHalfCountMagnitude) + subBucketIndex - subBucketHalfCount
const bitLength = (x: bigint) => (x === 0n ? 0 : x.toString(2).length);
const numberOfLeadingZeros64 = (x: bigint) => 64 - bitLength(x);

const reference = (histogram: JsHistogram, value: number) => {
  const unitMagnitude = histogram.unitMagnitude;
  const subBucketHalfCountMagnitude = histogram.subBucketHalfCountMagnitude;
  const leadingZeroCountBase =
    64 - unitMagnitude - subBucketHalfCountMagnitude - 1;
  const bucketIndex =
    leadingZeroCountBase -
    numberOfLeadingZeros64(BigInt(value) | BigInt(histogram.subBucketMask));
  const subBucketIndex = Number(
    BigInt(value) >> BigInt(bucketIndex + unitMagnitude)
  );
  const countsIndex =
    ((bucketIndex + 1) << subBucketHalfCountMagnitude) +
    subBucketIndex -
    histogram.subBucketHalfCount;
  return { bucketIndex, subBucketIndex, countsIndex };
};

const check = (histogram: JsHistogram, value: number) => {
  const expected = reference(histogram, value);
  const bucketIndex = histogram.getBucketIndex(value);
  const subBucketIndex = histogram.getSubBucketIndex(value, bucketIndex);
  const countsIndex = histogram.countsArrayIndex(value);
  expect({ value, bucketIndex, subBucketIndex, countsIndex }).toEqual({
    value,
    ...expected,
  });
};

const arbHistogram = fc
  .record({
    // lowestDiscernibleValue up to 2^40, biased towards small values
    lowestDiscernibleValue: fc.oneof(
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: 1, max: 2 ** 40 })
    ),
    numberOfSignificantValueDigits: fc.integer({ min: 0, max: 5 }),
  })
  .map(
    ({ lowestDiscernibleValue, numberOfSignificantValueDigits }) =>
      new Int32Histogram(
        lowestDiscernibleValue,
        Number.MAX_SAFE_INTEGER,
        numberOfSignificantValueDigits
      )
  );

const arbValue = fc.oneof(
  fc.integer({ min: 0, max: 2 ** 32 - 1 }),
  fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  // powers of two and their neighbours, where floor(log2(value)) is the trickiest
  fc
    .tuple(fc.integer({ min: 0, max: 53 }), fc.integer({ min: -2, max: 2 }))
    .map(([exponent, delta]) =>
      Math.min(Math.max(2 ** exponent + delta, 0), Number.MAX_SAFE_INTEGER)
    )
);

describe("JsHistogram bucket index computation", () => {
  it("should match the exact Java formula for any histogram settings and value", () => {
    fc.assert(
      fc.property(arbHistogram, arbValue, (histogram, value) => {
        check(histogram, value);
      }),
      runnerOptions
    );
  });

  it("should be exact on every 2^k, 2^k - 1 and 2^k + 1 up to 2^53 - 1 for any histogram settings", () => {
    fc.assert(
      fc.property(arbHistogram, (histogram) => {
        check(histogram, 0);
        for (let exponent = 0; exponent < 53; exponent++) {
          const powerOfTwo = 2 ** exponent;
          check(histogram, powerOfTwo - 1);
          check(histogram, powerOfTwo);
          check(histogram, powerOfTwo + 1);
        }
        check(histogram, Number.MAX_SAFE_INTEGER);
      }),
      { ...runnerOptions, numRuns: runFromStryker ? 5 : 100 }
    );
  });
});
