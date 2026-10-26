/*
 * Cross-checks the SIMD kernels over the counts array (percentile scan,
 * add, subtract, establishInternalTackingValues, clear) against scalar
 * reference loops, for every flat storage width and for array lengths that
 * leave partial blocks at the end.
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import Histogram from "../Histogram";
import {
  Histogram8,
  Histogram16,
  Histogram32,
  Histogram64,
  Storage,
} from "../Histogram";
import ulp from "../ulp";

// Deterministic LCG so runs are reproducible.
let seed: u32 = 12345;
function nextRandom(): u32 {
  seed = seed * 1664525 + 1013904223;
  return seed;
}

// Spread counts across the whole counts array with gaps, so SIMD blocks see a
// mix of zero and non-zero lanes. Goes through recordCountAtValue so that
// totalCount / maxValue / minNonZeroValue are maintained by the scalar path.
function fill<T, U>(h: Histogram<T, U>, density: u32, maxCount: u32): void {
  for (let i = 0; i < h.countsArrayLength; i++) {
    if (nextRandom() % density == 0) {
      h.recordCountAtValue(<u64>(nextRandom() % maxCount) + 1, h.valueFromIndex(i));
    }
  }
}

function scalarValueAtPercentile<T, U>(h: Histogram<T, U>, percentile: f64): u64 {
  const requestedPercentile = min(percentile, <f64>100);
  const fpCountAtPercentile = (requestedPercentile / 100.0) * <f64>h.totalCount;
  const countAtPercentile = <u64>max(ceil(fpCountAtPercentile - ulp(fpCountAtPercentile)), 1);
  let total: u64 = 0;
  for (let i = 0; i < h.countsArrayLength; i++) {
    total += h.getCountAtIndex(i);
    if (total >= countAtPercentile) {
      const value = h.valueFromIndex(i);
      return percentile == 0.0 ? h.lowestEquivalentValue(value) : h.highestEquivalentValue(value);
    }
  }
  return 0;
}

const PERCENTILES: f64[] = [0, 0.01, 1, 25, 50, 75, 99, 99.9, 99.99, 100];

// maxCount should exercise the top bit of the storage width, so that a signed
// widening would be caught.
function checkPercentiles<T, U>(h: Histogram<T, U>, maxCount: u32): void {
  fill<T, U>(h, 3, maxCount);
  for (let p = 0; p < PERCENTILES.length; p++) {
    expect<u64>(h.getValueAtPercentile(PERCENTILES[p])).equal(
      scalarValueAtPercentile<T, U>(h, PERCENTILES[p])
    );
  }
}

// maxCountA + maxCountB must fit in the storage width.
function checkAddSubtract<T, U>(a: Histogram<T, U>, b: Histogram<T, U>, maxCountA: u32, maxCountB: u32): void {
  fill<T, U>(a, 3, maxCountA);
  fill<T, U>(b, 2, maxCountB);
  const length = a.countsArrayLength;
  expect<i32>(b.countsArrayLength).equal(length);
  const before = new StaticArray<u64>(length);
  for (let i = 0; i < length; i++) before[i] = a.getCountAtIndex(i);
  const totalBefore = a.totalCount;

  a.add<T, U>(b);
  let mismatches = 0;
  for (let i = 0; i < length; i++) {
    if (a.getCountAtIndex(i) != before[i] + b.getCountAtIndex(i)) mismatches++;
  }
  expect<i32>(mismatches).equal(0);
  expect<u64>(a.totalCount).equal(totalBefore + b.totalCount);

  a.subtract<T, U>(b);
  mismatches = 0;
  for (let i = 0; i < length; i++) {
    if (a.getCountAtIndex(i) != before[i]) mismatches++;
  }
  expect<i32>(mismatches).equal(0);
  expect<u64>(a.totalCount).equal(totalBefore);
}

function checkEstablishTrackingValues<T, U>(h: Histogram<T, U>): void {
  // scalar reference
  let maxIndex = -1;
  let minNonZeroIndex = -1;
  let total: u64 = 0;
  for (let i = 0; i < h.countsArrayLength; i++) {
    const count = h.getCountAtIndex(i);
    if (count > 0) {
      total += count;
      maxIndex = i;
      if (minNonZeroIndex == -1 && i != 0) minNonZeroIndex = i;
    }
  }
  h.totalCount = 0;
  h.maxValue = 0;
  h.minNonZeroValue = u64.MAX_VALUE;

  h.establishInternalTackingValues();

  expect<u64>(h.totalCount).equal(total);
  if (maxIndex >= 0) {
    expect<u64>(h.maxValue).equal(
      h.highestEquivalentValue(h.valueFromIndex(maxIndex)) + h.unitMagnitudeMask
    );
  } else {
    expect<u64>(h.maxValue).equal(0);
  }
  if (minNonZeroIndex >= 0 && h.valueFromIndex(minNonZeroIndex) > h.unitMagnitudeMask) {
    expect<u64>(h.minNonZeroValue).equal(
      h.valueFromIndex(minNonZeroIndex) & ~h.unitMagnitudeMask
    );
  } else {
    expect<u64>(h.minNonZeroValue).equal(u64.MAX_VALUE);
  }
}

describe("Percentile scan over counts array", () => {
  // 0 significant digits => subBucketHalfCount = 1 => odd array lengths (scalar tail only)
  test("8 bit counts, tiny array", () => {
    checkPercentiles<Storage<u8>, u8>(new Histogram8(1, 100000, 0), 255);
  });
  test("8 bit counts, array length multiple of 16 but not of 64", () => {
    checkPercentiles<Storage<u8>, u8>(new Histogram8(1, 10000000, 1), 255);
  });
  test("8 bit counts, large array", () => {
    checkPercentiles<Storage<u8>, u8>(new Histogram8(1, 10000000, 3), 255);
  });
  test("16 bit counts", () => {
    checkPercentiles<Storage<u16>, u16>(new Histogram16(1, 1000000000, 2), 65535);
  });
  test("32 bit counts, odd array length", () => {
    checkPercentiles<Storage<u32>, u32>(new Histogram32(1, 1099511627776, 0), 4000000000);
  });
  test("32 bit counts, large array", () => {
    checkPercentiles<Storage<u32>, u32>(new Histogram32(1, 9007199254740991, 3), 4000000000);
  });
  test("64 bit counts", () => {
    checkPercentiles<Storage<u64>, u64>(new Histogram64(1, 1000000000, 2), 4000000000);
  });
  test("lowest discernible value above 1", () => {
    checkPercentiles<Storage<u32>, u32>(new Histogram32(16, 100000000, 2), 4000000000);
  });
});

describe("Add & subtract over counts array", () => {
  test("8 bit counts, scalar tail", () => {
    checkAddSubtract<Storage<u8>, u8>(new Histogram8(1, 100000, 0), new Histogram8(1, 100000, 0), 127, 128);
  });
  test("8 bit counts, large array", () => {
    checkAddSubtract<Storage<u8>, u8>(new Histogram8(1, 10000000, 3), new Histogram8(1, 10000000, 3), 127, 128);
  });
  test("16 bit counts", () => {
    checkAddSubtract<Storage<u16>, u16>(new Histogram16(1, 1000000000, 2), new Histogram16(1, 1000000000, 2), 32767, 32768);
  });
  test("32 bit counts, odd array length", () => {
    checkAddSubtract<Storage<u32>, u32>(new Histogram32(1, 1099511627776, 0), new Histogram32(1, 1099511627776, 0), 2147483647, 2147483648);
  });
  test("32 bit counts, large array", () => {
    checkAddSubtract<Storage<u32>, u32>(new Histogram32(1, 9007199254740991, 3), new Histogram32(1, 9007199254740991, 3), 2147483647, 2147483648);
  });
  test("64 bit counts", () => {
    checkAddSubtract<Storage<u64>, u64>(new Histogram64(1, 1000000000, 2), new Histogram64(1, 1000000000, 2), 4000000000, 4000000000);
  });
  test("adding a histogram to itself doubles every count", () => {
    const h = new Histogram32(1, 10000000, 3);
    fill<Storage<u32>, u32>(h, 2, 100);
    const length = h.countsArrayLength;
    const before = new StaticArray<u64>(length);
    for (let i = 0; i < length; i++) before[i] = h.getCountAtIndex(i);
    const totalBefore = h.totalCount;
    h.add<Storage<u32>, u32>(h);
    let mismatches = 0;
    for (let i = 0; i < length; i++) {
      if (h.getCountAtIndex(i) != before[i] * 2) mismatches++;
    }
    expect<i32>(mismatches).equal(0);
    expect<u64>(h.totalCount).equal(totalBefore * 2);
  });
});

describe("Establishing internal tracking values from counts array", () => {
  test("random counts, 8 bit", () => {
    const h = new Histogram8(1, 10000000, 3);
    fill<Storage<u8>, u8>(h, 5, 255);
    checkEstablishTrackingValues<Storage<u8>, u8>(h);
  });
  test("random counts, 16 bit, odd array length", () => {
    const h = new Histogram16(1, 100000, 0);
    fill<Storage<u16>, u16>(h, 2, 65535);
    checkEstablishTrackingValues<Storage<u16>, u16>(h);
  });
  test("random counts, 32 bit", () => {
    const h = new Histogram32(1, 9007199254740991, 3);
    fill<Storage<u32>, u32>(h, 7, 4000000000);
    checkEstablishTrackingValues<Storage<u32>, u32>(h);
  });
  test("random counts, 64 bit, lowest discernible value above 1", () => {
    const h = new Histogram64(16, 100000000, 2);
    fill<Storage<u64>, u64>(h, 3, 4000000000);
    checkEstablishTrackingValues<Storage<u64>, u64>(h);
  });
  test("empty histogram", () => {
    checkEstablishTrackingValues<Storage<u32>, u32>(new Histogram32(1, 10000000, 3));
  });
  test("count only at index 0 leaves minNonZeroValue unset", () => {
    const h = new Histogram32(1, 10000000, 3);
    h.recordCountAtValue(3, 0);
    checkEstablishTrackingValues<Storage<u32>, u32>(h);
  });
  test("single count in the last lane of the array", () => {
    const h = new Histogram32(1, 10000000, 3);
    h.recordCountAtValue(1, h.valueFromIndex(h.countsArrayLength - 1));
    checkEstablishTrackingValues<Storage<u32>, u32>(h);
  });
  test("single count in the middle of a vector", () => {
    const h = new Histogram8(1, 10000000, 3);
    h.recordCountAtValue(1, h.valueFromIndex(1029));
    checkEstablishTrackingValues<Storage<u8>, u8>(h);
  });
});

describe("Clearing counts array", () => {
  test("reset zeroes every count, including the tail", () => {
    const h = new Histogram32(1, 1099511627776, 0);
    fill<Storage<u32>, u32>(h, 1, 100);
    h.reset();
    let nonZero = 0;
    for (let i = 0; i < h.countsArrayLength; i++) {
      if (h.getCountAtIndex(i) != 0) nonZero++;
    }
    expect<i32>(nonZero).equal(0);
    expect<u64>(h.totalCount).equal(0);
  });
});
