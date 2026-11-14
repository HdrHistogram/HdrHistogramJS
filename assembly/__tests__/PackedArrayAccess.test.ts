/*
 * Cross-checks PackedArray get/set/add (with its leaf cache) against a plain
 * array model, including interleaved reads and writes within a leaf group,
 * carries across bytes, clear and resize.
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import { PackedArray } from "../packedarray/PackedArray";

let seed: u32 = 777;
function nextRandom(): u32 {
  seed = seed * 1664525 + 1013904223;
  return seed;
}

function mismatches(packed: PackedArray, model: StaticArray<u64>): i32 {
  let count = 0;
  // forward scan (cache hits), then random access (cache misses)
  for (let i = 0; i < model.length; i++) {
    if (packed.get(i) != model[i]) count++;
  }
  for (let n = 0; n < model.length; n++) {
    const i = <i32>(nextRandom() % <u32>model.length);
    if (packed.get(i) != model[i]) count++;
  }
  return count;
}

describe("Packed Array add", () => {
  test("add should carry into the next byte", () => {
    const packed = new PackedArray(1024);
    packed.add(42, 200);
    packed.add(42, 100);
    expect<u64>(packed.get(42)).equal(300);
  });

  test("increment should carry across several bytes", () => {
    const packed = new PackedArray(1024);
    packed.set(7, 0xffff);
    packed.increment(7);
    expect<u64>(packed.get(7)).equal(0x10000);
  });

  test("add should reach the top byte", () => {
    const packed = new PackedArray(1024);
    packed.add(3, 0x0100000000000000);
    packed.add(3, 0xff00000000000000);
    packed.add(3, 1);
    expect<u64>(packed.get(3)).equal(1);
  });
});

describe("Packed Array leaf cache", () => {
  test("reads within a group see writes made between them", () => {
    const packed = new PackedArray(64);
    expect<u64>(packed.get(16)).equal(0); // caches group 2 as empty
    packed.set(17, 5); // inserts set 0 leaf for group 2
    expect<u64>(packed.get(16)).equal(0);
    expect<u64>(packed.get(17)).equal(5);
    packed.set(18, 0x1234); // inserts set 1 leaf for group 2
    expect<u64>(packed.get(18)).equal(0x1234);
    expect<u64>(packed.get(17)).equal(5);
    packed.add(17, 0x100); // set 1 already present, written through
    expect<u64>(packed.get(17)).equal(0x105);
    packed.add(19, 0x10000); // inserts set 2 leaf while group is cached
    expect<u64>(packed.get(19)).equal(0x10000);
    expect<u64>(packed.get(17)).equal(0x105);
  });

  test("set to a smaller value clears the higher bytes", () => {
    const packed = new PackedArray(64);
    packed.set(9, 0x010203);
    expect<u64>(packed.get(9)).equal(0x010203);
    packed.set(9, 7);
    expect<u64>(packed.get(9)).equal(7);
    packed.set(9, 0);
    expect<u64>(packed.get(9)).equal(0);
  });

  test("random set / add / get matches a plain array", () => {
    const length = 5000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let n = 0; n < 20000; n++) {
      const i = <i32>(nextRandom() % <u32>length);
      const op = nextRandom() % 3;
      if (op == 0) {
        // counts below 2^24: a packed array is meant for sparse, small values and
        // its 16 bit entry indexes cap the physical size (same as the Java version)
        const v = <u64>(nextRandom() % 16777216);
        packed.set(i, v);
        model[i] = v;
      } else if (op == 1) {
        const v = <u64>(nextRandom() % 100000);
        packed.add(i, v);
        model[i] += v;
      } else {
        // read in the middle of writes, keeps the cache exercised
        if (packed.get(i) != model[i]) {
          expect<u64>(packed.get(i)).equal(model[i]);
        }
      }
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("clear invalidates the cache", () => {
    const packed = new PackedArray(256);
    packed.set(100, 42);
    expect<u64>(packed.get(100)).equal(42);
    packed.clear();
    expect<u64>(packed.get(100)).equal(0);
    packed.set(101, 1);
    expect<u64>(packed.get(100)).equal(0);
    expect<u64>(packed.get(101)).equal(1);
  });

  test("resize keeps values readable", () => {
    const packed = new PackedArray(256, 16);
    const model = new StaticArray<u64>(4096);
    for (let i = 0; i < 256; i += 3) {
      const v = <u64>(nextRandom() % 1000000);
      packed.set(i, v);
      model[i] = v;
    }
    expect<u64>(packed.get(255)).equal(model[255]);
    packed.resize(4096);
    for (let i = 256; i < 4096; i += 7) {
      const v = <u64>(nextRandom() % 1000000);
      packed.add(i, v);
      model[i] += v;
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("writes within a group see each other without reads in between", () => {
    // Writes alone cache their group, so the leaves looked up by one write
    // serve the next writes of the group, including sets never looked up yet.
    const packed = new PackedArray(64);
    packed.add(24, 1); // caches group 3, set 0 only
    packed.add(25, 0x200); // inserts set 1 while group 3 is cached
    packed.increment(25);
    packed.set(26, 0x030201); // inserts set 2
    packed.set(24, 0x7f); // set 0 known, higher sets looked up: no leaf yet for set 3
    expect<u64>(packed.get(24)).equal(0x7f);
    expect<u64>(packed.get(25)).equal(0x201);
    expect<u64>(packed.get(26)).equal(0x030201);
    expect<u64>(packed.get(27)).equal(0);
  });

  test("carries propagate through cached and uncached sets", () => {
    const packed = new PackedArray(64);
    packed.set(40, 0xffff); // sets 0 and 1
    expect<u64>(packed.get(40)).equal(0xffff);
    packed.add(41, 1); // cached group 5, set 0 known
    packed.increment(40); // carries into set 1 (cached) then inserts set 2
    expect<u64>(packed.get(40)).equal(0x10000);
    packed.add(40, 0xffffffffffff0000); // carries up to the top set
    expect<u64>(packed.get(40)).equal(0);
    expect<u64>(packed.get(41)).equal(1);
  });

  test("set to a smaller value through the cache clears the higher bytes", () => {
    const packed = new PackedArray(64);
    packed.set(50, 0x01020304);
    packed.set(51, 0x05); // group 6 cached by the write above
    packed.set(50, 0x0102); // sets 2 and 3 are cached leaves, zeroed
    expect<u64>(packed.get(50)).equal(0x0102);
    packed.set(50, 0);
    expect<u64>(packed.get(50)).equal(0);
    packed.set(52, 0); // no leaf created for a zero at an unknown set
    expect<u64>(packed.get(52)).equal(0);
    expect<u64>(packed.get(51)).equal(5);
  });

  test("cached writes keep their values when the packed storage fills up", () => {
    const length = 5000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    for (let i = 0; i < length; i++) {
      // the cached group gets extra writes before the unpacking one
      const v = u64.MAX_VALUE - i;
      packed.add(i, v);
      model[i] += v;
      const neighbour = i & ~7;
      packed.add(neighbour, 1);
      model[neighbour] += 1;
    }
    expect<i32>(mismatches(packed, model)).equal(0);
    // and the array keeps working once unpacked
    packed.set(10, 42);
    model[10] = 42;
    packed.increment(11);
    model[11] += 1;
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("physical array growth during a cached group keeps the cache valid", () => {
    // Small initial capacity so inserts trigger resizeArray() repeatedly.
    const packed = new PackedArray(8192, 16);
    const model = new StaticArray<u64>(8192);
    for (let i = 0; i < 8192; i++) {
      packed.get(i); // cache group of i
      const v = <u64>(nextRandom() % 3000);
      packed.add(i, v);
      model[i] += v;
      if (packed.get(i) != model[i]) {
        expect<u64>(packed.get(i)).equal(model[i]);
      }
    }
    expect<i32>(mismatches(packed, model)).equal(0);
  });
});
