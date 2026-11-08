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
  test("empty array has no non-zero index", () => {
    const packed = new PackedArray(100000);
    expect<i32>(packed.nextNonZeroIndex(0)).equal(-1);
    expect<i32>(packed.nextNonZeroIndex(99999)).equal(-1);
    expect<i32>(packed.nextNonZeroIndex(100000)).equal(-1);
  });

  test("walks a sparse array", () => {
    const length = 100000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let n = 0; n < 300; n++) {
      const i = <i32>(nextRandom() % <u32>length);
      const v = <u64>(1 + (nextRandom() % 1000));
      packed.add(i, v);
      model[i] += v;
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("finds values whose low byte is zero", () => {
    const packed = new PackedArray(4096);
    const model = new StaticArray<u64>(4096);
    packed.set(300, 256);
    model[300] = 256;
    packed.set(2000, 0x10000);
    model[2000] = 0x10000;
    packed.set(4095, 0x0100000000000000);
    model[4095] = 0x0100000000000000;
    expect<i32>(packed.nextNonZeroIndex(0)).equal(300);
    expect<i32>(packed.nextNonZeroIndex(301)).equal(2000);
    expect<i32>(packed.nextNonZeroIndex(2001)).equal(4095);
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("walks a dense array", () => {
    const length = 4096;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let i = 0; i < length; i++) {
      const v = <u64>(nextRandom() % 100000);
      packed.set(i, v);
      model[i] = v;
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("skips values set back to zero, leaving their leaf in place", () => {
    const length = 20000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let n = 0; n < 500; n++) {
      const i = <i32>(nextRandom() % <u32>length);
      const v = <u64>(1 + (nextRandom() % 100000));
      packed.set(i, v);
      model[i] = v;
    }
    for (let i = 0; i < length; i++) {
      if (model[i] != 0 && nextRandom() % 2 == 0) {
        packed.set(i, 0);
        model[i] = 0;
      }
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("walks the whole array after a resize", () => {
    const packed = new PackedArray(256, 16);
    const model = new StaticArray<u64>(100000);
    for (let i = 0; i < 256; i += 5) {
      const v = <u64>(1 + (nextRandom() % 1000000));
      packed.set(i, v);
      model[i] = v;
    }
    packed.resize(100000);
    for (let n = 0; n < 200; n++) {
      const i = <i32>(nextRandom() % 100000);
      const v = <u64>(1 + (nextRandom() % 1000000));
      packed.add(i, v);
      model[i] += v;
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("scans linearly once the array is unpacked", () => {
    // 64 bit values at every index outgrow the packed representation
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
    expect<i32>(mismatches(packed, model)).equal(0);
    packed.resize(6000);
    const grown = new StaticArray<u64>(6000);
    for (let i = 0; i < length; i++) grown[i] = model[i];
    packed.set(5999, 7);
    grown[5999] = 7;
    expect<i32>(mismatches(packed, grown)).equal(0);
  });
});
