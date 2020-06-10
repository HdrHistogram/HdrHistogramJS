/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { PackedArray } from "../packedarray/PackedArray";

describe("Packed Array", () => {
  it("should store a byte without extending array", () => {
    // given
    const packed = new PackedArray(1024);
    // when
    packed.set(42, 123);
    // then
    expect(packed.get(42)).toBe(123);
  });

  it("should resize array when storing data", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(12, u64.MAX_VALUE);

    // then
    const storedData = array.get(12);
    expect(storedData).toBe(u64.MAX_VALUE);
  });
  it("should store a big number", () => {
    // given
    const array = new PackedArray(45056, 16);

    // when
    array.set(32768, 1);

    // then
    const storedData = array.get(32768);
    expect(storedData).toBe(1);
    const storedDataAt0 = array.get(0);
    expect(storedDataAt0).toBe(0);
  });
});
