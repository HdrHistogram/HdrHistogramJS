/*
 * Cross-checks PackedArray.nextNonZeroIndex (set-0 tree walk) against a brute
 * force scan of a plain array model: sparse and dense contents, values whose
 * low byte is zero, values set back to zero, resizes and the unpacked fallback.
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import { PackedArray } from "../packedarray/PackedArray";

let seed: u32 = 4242;
function nextRandom(): u32 {
  seed = seed * 1664525 + 1013904223;
  return seed;
}

function bruteForceNext(model: StaticArray<u64>, fromIndex: i32): i32 {
  for (let i = fromIndex; i < model.length; i++) {
    if (model[i] != 0) return i;
  }
  return -1;
}

/**
 * Number of disagreements between the walk and the model: first a full walk
 * from index 0, then lookups from random start indexes (including past the end).
 */
function mismatches(packed: PackedArray, model: StaticArray<u64>): i32 {
  let count = 0;
  let index = packed.nextNonZeroIndex(0);
  let expected = bruteForceNext(model, 0);
  while (expected >= 0) {
    if (index != expected) count++;
    if (index < 0) break;
    index = packed.nextNonZeroIndex(index + 1);
    expected = bruteForceNext(model, expected + 1);
  }
  if (index != -1) count++;
  for (let n = 0; n < 200; n++) {
    const from = <i32>(nextRandom() % <u32>(model.length + 16));
    if (packed.nextNonZeroIndex(from) != bruteForceNext(model, from)) count++;
  }
  return count;
}

describe("Packed Array non-zero iteration", () => {
  test("should find no non-zero index in an empty array", () => {
    // given
    const packed = new PackedArray(100000);
    // when
    const fromStart = packed.nextNonZeroIndex(0);
    const fromLastIndex = packed.nextNonZeroIndex(99999);
    const fromEnd = packed.nextNonZeroIndex(100000);
    // then
    expect<i32>(fromStart).equal(-1);
    expect<i32>(fromLastIndex).equal(-1);
    expect<i32>(fromEnd).equal(-1);
  });

  test("should walk a sparse array", () => {
    // given
    const length = 100000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let n = 0; n < 300; n++) {
      const i = <i32>(nextRandom() % <u32>length);
      const v = <u64>(1 + (nextRandom() % 1000));
      packed.add(i, v);
      model[i] += v;
    }
    // when
    const count = mismatches(packed, model);
    // then
    expect<i32>(count).equal(0);
  });

  test("should find values whose low byte is zero", () => {
    // given
    const packed = new PackedArray(4096);
    const model = new StaticArray<u64>(4096);
    packed.set(300, 256);
    model[300] = 256;
    packed.set(2000, 0x10000);
    model[2000] = 0x10000;
    packed.set(4095, 0x0100000000000000);
    model[4095] = 0x0100000000000000;
    // when
    const first = packed.nextNonZeroIndex(0);
    const second = packed.nextNonZeroIndex(301);
    const third = packed.nextNonZeroIndex(2001);
    const count = mismatches(packed, model);
    // then
    expect<i32>(first).equal(300);
    expect<i32>(second).equal(2000);
    expect<i32>(third).equal(4095);
    expect<i32>(count).equal(0);
  });

  test("should walk a dense array", () => {
    // given
    const length = 4096;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let i = 0; i < length; i++) {
      const v = <u64>(nextRandom() % 100000);
      packed.set(i, v);
      model[i] = v;
    }
    // when
    const count = mismatches(packed, model);
    // then
    expect<i32>(count).equal(0);
  });

  test("should skip values set back to zero, leaving their leaf in place", () => {
    // given
    const length = 20000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let n = 0; n < 500; n++) {
      const i = <i32>(nextRandom() % <u32>length);
      const v = <u64>(1 + (nextRandom() % 100000));
      packed.set(i, v);
      model[i] = v;
    }
    // when
    for (let i = 0; i < length; i++) {
      if (model[i] != 0 && nextRandom() % 2 == 0) {
        packed.set(i, 0);
        model[i] = 0;
      }
    }
    const count = mismatches(packed, model);
    // then
    expect<i32>(count).equal(0);
  });

  test("should walk the whole array after a resize", () => {
    // given
    const packed = new PackedArray(256, 16);
    const model = new StaticArray<u64>(100000);
    for (let i = 0; i < 256; i += 5) {
      const v = <u64>(1 + (nextRandom() % 1000000));
      packed.set(i, v);
      model[i] = v;
    }
    packed.resize(100000);
    // when
    for (let n = 0; n < 200; n++) {
      const i = <i32>(nextRandom() % 100000);
      const v = <u64>(1 + (nextRandom() % 1000000));
      packed.add(i, v);
      model[i] += v;
    }
    const count = mismatches(packed, model);
    // then
    expect<i32>(count).equal(0);
  });

  test("should scan linearly once the array is unpacked", () => {
    // 64 bit values at every index outgrow the packed representation
    // given
    const length = 5000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let i = 0; i < length; i++) {
      packed.set(i, u64.MAX_VALUE - i);
      model[i] = u64.MAX_VALUE - i;
    }
    for (let i = 0; i < length; i++) {
      if (nextRandom() % 4 != 0) {
        packed.set(i, 0);
        model[i] = 0;
      }
    }
    // when
    const countBeforeResize = mismatches(packed, model);
    // then
    expect<i32>(countBeforeResize).equal(0);

    // given
    packed.resize(6000);
    const grown = new StaticArray<u64>(6000);
    for (let i = 0; i < length; i++) grown[i] = model[i];
    packed.set(5999, 7);
    grown[5999] = 7;
    // when
    const countAfterResize = mismatches(packed, grown);
    // then
    expect<i32>(countAfterResize).equal(0);
  });
});
