/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { bitCount } from "../packedarray/bitcount";

describe("bit count", () => {
  it("should count bits", () => {
    expect<u8>(bitCount(8)).toBe(1);
    expect<u8>(bitCount(40)).toBe(2);
    expect<u8>(bitCount((u64.MAX_VALUE >> 1) + 1)).toBe(1);
  });
});
