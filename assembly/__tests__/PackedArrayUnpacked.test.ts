/*
 * The packed representation addresses entries with 16 bit indexes. Like the
 * Java version, once the physical storage would outgrow that range the array
 * must switch to an unpacked context (one u64 per virtual index) instead of
 * corrupting itself.
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import { PackedArray } from "../packedarray/PackedArray";
import { Histogram64, PackedHistogram, Storage } from "../Histogram";

let seed: u32 = 4242;
function nextRandom(): u32 {
  seed = seed * 1664525 + 1013904223;
  return seed;
}

function mismatches(packed: PackedArray, model: StaticArray<u64>): i32 {
  let count = 0;
  for (let i = 0; i < model.length; i++) {
    if (packed.get(i) != model[i]) count++;
  }
  return count;
}

// 64 bit values at every index: 8 leaves per group of 8 indexes, far beyond
// the 8191 longs a packed context can address.
function fillWide(packed: PackedArray, model: StaticArray<u64>, from: i32, to: i32): void {
  for (let n = 0; n < (to - from) * 4; n++) {
    const i = from + <i32>(nextRandom() % <u32>(to - from));
    if (nextRandom() % 2 == 0) {
      const v = (<u64>nextRandom() << 32) | <u64>nextRandom();
      packed.set(i, v);
      model[i] = v;
    } else {
      const v = <u64>nextRandom() << (nextRandom() % 32);
      packed.add(i, v);
      model[i] += v;
    }
  }
}

describe("Packed Array outgrowing the packed representation", () => {
  test("switches to an unpacked context instead of corrupting values", () => {
    const length = 5000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    expect<bool>(packed.isPacked).equal(true);
    fillWide(packed, model, 0, length);
    expect<bool>(packed.isPacked).equal(false);
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("keeps the physical length equal to the virtual length once unpacked", () => {
    const length = 5000;
    const packed = new PackedArray(length);
    const model = new StaticArray<u64>(length);
    fillWide(packed, model, 0, length);
    expect<i32>(packed.getPhysicalLength()).equal(length);
    expect<i32>(packed.length()).equal(length);
  });

  test("resize after the switch keeps values and stays unpacked", () => {
    const packed = new PackedArray(5000);
    const model = new StaticArray<u64>(12000);
    fillWide(packed, model, 0, 5000);
    packed.resize(12000);
    expect<bool>(packed.isPacked).equal(false);
    expect<i32>(mismatches(packed, model)).equal(0);
    fillWide(packed, model, 5000, 12000);
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("clear after the switch zeroes everything and stays unpacked", () => {
    const packed = new PackedArray(5000);
    const model = new StaticArray<u64>(5000);
    fillWide(packed, model, 0, 5000);
    packed.clear();
    for (let i = 0; i < 5000; i++) model[i] = 0;
    expect<i32>(mismatches(packed, model)).equal(0);
    expect<bool>(packed.isPacked).equal(false);
    fillWide(packed, model, 0, 5000);
    expect<i32>(mismatches(packed, model)).equal(0);
  });

  test("a packed histogram with many large counts matches the 64 bit histogram", () => {
    const packed = new PackedHistogram(1, 1000000000, 3);
    const plain = new Histogram64(1, 1000000000, 3);
    for (let n = 0; n < 6000; n++) {
      const value = <u64>(nextRandom() % 1000000000);
      const count = (<u64>nextRandom() << 20) + 1;
      packed.recordCountAtValue(count, value);
      plain.recordCountAtValue(count, value);
    }
    expect<u64>(packed.totalCount).equal(plain.totalCount);
    expect<u64>(packed.maxValue).equal(plain.maxValue);
    const percentiles: f64[] = [0, 10, 50, 90, 99, 99.9, 100];
    for (let p = 0; p < percentiles.length; p++) {
      expect<u64>(packed.getValueAtPercentile(percentiles[p])).equal(
        plain.getValueAtPercentile(percentiles[p])
      );
    }
    packed.subtract<Storage<u64>, u64>(plain);
    expect<u64>(packed.totalCount).equal(0);
  });
});
