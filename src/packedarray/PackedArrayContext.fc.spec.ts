/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import * as fc from "fast-check";
import { bitCount } from "./PackedArrayContext";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
  verbose: true
};

// Reference population count, one bit at a time on the low 32 bits of each word
const referenceBitCount = (n: number) => {
  let bits = 0;
  let rest = n;
  while (rest > 0) {
    const word = rest % 0x100000000;
    for (let bit = 0; bit < 32; bit++) {
      bits += Math.floor(word / 2 ** bit) % 2;
    }
    rest = Math.floor(rest / 0x100000000);
  }
  return bits;
};

describe("Packed array context", () => {
  it("should count the set bits of a value below 2^53", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        n => bitCount(n) === referenceBitCount(n)
      ),
      runnerOptions
    );
  });

  it("should count the set bits of the 16 bit slot indicators", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }),
        n => bitCount(n) === referenceBitCount(n)
      ),
      runnerOptions
    );
  });

  it("should count the bits of values above 2^32 in every word", () => {
    expect(bitCount(0)).toBe(0);
    expect(bitCount(0xffffffff)).toBe(32);
    expect(bitCount(0x100000000)).toBe(1);
    expect(bitCount(0x1ffffffff)).toBe(33);
    expect(bitCount(Number.MAX_SAFE_INTEGER)).toBe(53);
  });
});
