/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import { PackedArray } from "../packedarray/PackedArray";

// Set 0 of a packed array uses 16 byte leaves: these tests cover the resize, sharing,
// fallback and random paths that the wider leaves change.
describe("Packed Array with 16 byte leaves for set 0", () => {
  test("should keep values when a resize changes the depth of the set trees", () => {
    // given: the set 0 tree gets one more level past 2^12, the others past 2^10
    const array = new PackedArray(1000, 16);
    array.set(0, 1);
    array.set(17, 300);
    array.set(255, 70000);
    array.set(700, 1099511627781);
    array.set(999, 42);

    // when
    array.setVirtualLength(8192);
    array.set(8000, 5);

    // then
    expect(array.get(0)).equal(1);
    expect(array.get(17)).equal(300);
    expect(array.get(255)).equal(70000);
    expect(array.get(700)).equal(1099511627781);
    expect(array.get(999)).equal(42);
    expect(array.get(8000)).equal(5);
    expect(array.get(4096)).equal(0);
  });

  test("should share one leaf between the indexes of a 16 index block", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 1);
    const physicalLength = array.getPhysicalLength();

    // when: the other 15 indexes of the block are written, in both 8 index groups
    for (let index = 17; index < 32; index++) {
      array.set(index, <u64>index);
    }

    // then
    expect(array.getPhysicalLength()).equal(physicalLength);
    expect(array.get(16)).equal(1);
    for (let index = 17; index < 32; index++) {
      expect(array.get(index)).equal(<u64>index);
    }
  });

  test("should keep set 0 coherent when alternating between the two groups of a 16 index block", () => {
    // given: group 0 is cached with no leaf, then group 1 of the same block gets one
    const array = new PackedArray(1024, 16);
    expect(array.get(3)).equal(0);
    array.set(9, 5);

    // when / then: back to group 0 of the block, which now shares the leaf
    expect(array.get(3)).equal(0);
    expect(array.get(9)).equal(5);
    array.add(2, 7);
    expect(array.get(2)).equal(7);
    expect(array.get(9)).equal(5);
    array.set(1, 0);
    expect(array.get(1)).equal(0);
  });

  test("should keep values once the packed storage falls back to unpacked", () => {
    // given: isolated values, one leaf each, until the 16 bit addresses run out
    const length: i32 = 1 << 16;
    const array = new PackedArray(length, 16);
    const plain = new Array<u64>(length);
    for (let i = 0; i < length; i++) plain[i] = 0;
    for (let i = 0; i < 20000 && array.getPhysicalLength() <= 8191; i++) {
      const index = (i * 7919) % length;
      array.add(index, <u64>(i + 1));
      plain[index] += <u64>(i + 1);
    }

    // then
    expect(array.getPhysicalLength() > 8191).equal(true);
    for (let index = 0; index < length; index++) {
      expect(array.get(index)).equal(plain[index]);
    }
  });

  test("should match a plain array across the depth thresholds of the set trees", () => {
    const lengths: i32[] = [1000, 4096, 4097, 8192, 8193, 40000];
    let seed: u32 = 2024;
    for (let l = 0; l < lengths.length; l++) {
      const length = lengths[l];
      // given
      const array = new PackedArray(length, 16);
      const plain = new Array<u64>(length);
      for (let i = 0; i < length; i++) plain[i] = 0;

      // when: a hot band, isolated values, carries into the next sets
      for (let k = 0; k < 20000; k++) {
        seed = seed * 1664525 + 1013904223;
        const hot = (seed >>> 8) % 2 == 0;
        seed = seed * 1664525 + 1013904223;
        const index = hot
          ? min(length - 1, 100 + <i32>((seed >>> 8) % 40))
          : <i32>((seed >>> 8) % <u32>length);
        seed = seed * 1664525 + 1013904223;
        const value: u64 = (seed >>> 8) % 5 == 0 ? 250 + <u64>((seed >>> 8) % 10) : 1;
        array.add(index, value);
        plain[index] += value;
      }

      // then
      for (let index = 0; index < length; index++) {
        expect(array.get(index)).equal(plain[index]);
      }
    }
  });
});
