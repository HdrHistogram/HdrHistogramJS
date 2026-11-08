/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import * as fc from "fast-check";
import { PackedArray } from "./PackedArray";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
  verbose: true,
};

describe("Packed array", () => {
  it("should store data as a regular sparse array", () => {
    const SIZE = 1000;
    fc.assert(
      fc.property(arbData(SIZE), (entries) => {
        const packedArray = new PackedArray(SIZE + 1);
        const sparseArray = new Array();
        entries.forEach(([index, value]) => packedArray.add(index, value));
        entries.forEach(([index, value]) => {
          if (sparseArray[index]) {
            sparseArray[index] = sparseArray[index] + value;
          } else {
            sparseArray[index] = value;
          }
        });
        return entries.every(
          ([index]) => sparseArray[index] === packedArray.get(index)
        );
      }),
      runnerOptions
    );
  });
});

describe("Packed array non-zero iteration", () => {
  const bruteForceNext = (model: number[], fromIndex: number) => {
    for (let i = fromIndex; i < model.length; i++) {
      if (model[i] !== 0) return i;
    }
    return -1;
  };

  /** The walk from 0 visits exactly the non-zero indexes of the model, in order */
  const walkMatches = (packedArray: PackedArray, model: number[]) => {
    const walked: number[] = [];
    for (
      let i = packedArray.nextNonZeroIndex(0);
      i >= 0;
      i = packedArray.nextNonZeroIndex(i + 1)
    ) {
      walked.push(i);
    }
    const expected: number[] = [];
    model.forEach((value, index) => {
      if (value !== 0) expected.push(index);
    });
    expect(walked).toEqual(expected);
  };

  /** nextNonZeroIndex agrees with a brute force scan from arbitrary start indexes */
  const lookupsMatch = (
    packedArray: PackedArray,
    model: number[],
    fromIndexes: number[]
  ) => {
    fromIndexes.forEach((fromIndex) => {
      expect(packedArray.nextNonZeroIndex(fromIndex)).toBe(
        bruteForceNext(model, fromIndex)
      );
    });
  };

  const arbFromIndexes = (size: number) =>
    fc.array(fc.integer({ min: 0, max: size + 10 }), { maxLength: 20 });

  it("should visit the non-zero indexes of a sparse array", () => {
    const SIZE = 100000;
    fc.assert(
      fc.property(
        arbSparseData(SIZE, 300),
        arbFromIndexes(SIZE),
        (entries, fromIndexes) => {
          const packedArray = new PackedArray(SIZE);
          const model = new Array(SIZE).fill(0);
          entries.forEach(([index, value]) => {
            packedArray.add(index, value);
            model[index] += value;
          });
          walkMatches(packedArray, model);
          lookupsMatch(packedArray, model, fromIndexes);
        }
      ),
      runnerOptions
    );
  });

  it("should visit the non-zero indexes of a dense array", () => {
    const SIZE = 2048;
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0x1ffff }), {
          minLength: SIZE,
          maxLength: SIZE,
        }),
        arbFromIndexes(SIZE),
        (values, fromIndexes) => {
          const packedArray = new PackedArray(SIZE);
          values.forEach((value, index) => packedArray.set(index, value));
          walkMatches(packedArray, values);
          lookupsMatch(packedArray, values, fromIndexes);
        }
      ),
      { ...runnerOptions, numRuns: runFromStryker ? 5 : 100 }
    );
  });

  it("should skip values set back to zero", () => {
    const SIZE = 50000;
    fc.assert(
      fc.property(
        arbSparseData(SIZE, 200),
        fc.array(fc.nat(199), { maxLength: 100 }),
        (entries, zeroedPositions) => {
          const packedArray = new PackedArray(SIZE);
          const model = new Array(SIZE).fill(0);
          entries.forEach(([index, value]) => {
            packedArray.set(index, value);
            model[index] = value;
          });
          zeroedPositions.forEach((position) => {
            if (position < entries.length) {
              const [index] = entries[position];
              packedArray.set(index, 0);
              model[index] = 0;
            }
          });
          walkMatches(packedArray, model);
        }
      ),
      runnerOptions
    );
  });

  it("should keep walking after the virtual length grows", () => {
    fc.assert(
      fc.property(
        arbSparseData(500, 50),
        arbSparseData(100000, 100),
        (entriesBefore, entriesAfter) => {
          const packedArray = new PackedArray(501);
          const model = new Array(100001).fill(0);
          entriesBefore.forEach(([index, value]) => {
            packedArray.add(index, value);
            model[index] += value;
          });
          packedArray.setVirtualLength(100001);
          entriesAfter.forEach(([index, value]) => {
            packedArray.add(index, value);
            model[index] += value;
          });
          walkMatches(packedArray, model);
        }
      ),
      runnerOptions
    );
  });

  it("should scan linearly once the packed storage is full", () => {
    // 64 bit values at every index outgrow the packed representation
    const SIZE = 5000;
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: SIZE, maxLength: SIZE }),
        arbFromIndexes(SIZE),
        (keep, fromIndexes) => {
          const packedArray = new PackedArray(SIZE);
          const model = new Array(SIZE).fill(0);
          for (let index = 0; index < SIZE; index++) {
            packedArray.set(index, Number.MAX_SAFE_INTEGER - index);
          }
          expect(packedArray.getPhysicalLength()).toBe(SIZE); // unpacked
          keep.forEach((isKept, index) => {
            if (isKept) {
              model[index] = Number.MAX_SAFE_INTEGER - index;
            } else {
              packedArray.set(index, 0);
            }
          });
          walkMatches(packedArray, model);
          lookupsMatch(packedArray, model, fromIndexes);
        }
      ),
      { ...runnerOptions, numRuns: runFromStryker ? 3 : 20 }
    );
  });
});

describe("Packed array leaf cache", () => {
  it("should match a plain array under interleaved operations within a few groups", () => {
    // 4 groups of 8 indexes: most operations hit the cached group, with
    // writes touching sets the cache has not looked up yet, carries across
    // sets, and sets to smaller values (including 0) clearing higher bytes
    const SIZE = 32;
    fc.assert(
      fc.property(arbOperations(SIZE), (operations) => {
        const packedArray = new PackedArray(SIZE);
        const model = new Array<number>(SIZE).fill(0);
        for (const operation of operations) {
          const { index } = operation;
          switch (operation.type) {
            case "add":
              packedArray.add(index, operation.value);
              model[index] += operation.value;
              break;
            case "increment":
              packedArray.increment(index);
              model[index] += 1;
              break;
            case "set":
              packedArray.set(index, operation.value);
              model[index] = operation.value;
              break;
            case "get":
              if (packedArray.get(index) !== model[index]) {
                return false;
              }
              break;
          }
        }
        return model.every((value, index) => packedArray.get(index) === value);
      }),
      runnerOptions
    );
  });

  it("should keep values once cached writes fill up the packed storage", () => {
    // 7 byte values at every index need far more storage than the
    // 16 bit indexes of a packed context can address
    const SIZE = 5000;
    fc.assert(
      fc.property(arbOperations(SIZE), (operations) => {
        const packedArray = new PackedArray(SIZE);
        const model = new Array<number>(SIZE).fill(0);
        for (let index = 0; index < SIZE; index++) {
          // cached write (same group as the previous index) when the packed
          // storage becomes full
          const value = Number.MAX_SAFE_INTEGER - index;
          packedArray.add(index, value);
          model[index] += value;
          for (const operation of operations) {
            if (operation.index >> 3 !== index >> 3) {
              continue;
            }
            if (operation.type === "set") {
              packedArray.set(operation.index, operation.value);
              model[operation.index] = operation.value;
            } else if (
              operation.type === "add" &&
              model[operation.index] + operation.value <=
                Number.MAX_SAFE_INTEGER
            ) {
              packedArray.add(operation.index, operation.value);
              model[operation.index] += operation.value;
            }
          }
        }
        return model.every((value, index) => packedArray.get(index) === value);
      }),
      { ...runnerOptions, numRuns: runFromStryker ? 2 : 20 }
    );
  });
});

const arbData = (size: number) =>
  fc.array(
    fc.tuple(
      fc.integer({ min: 1, max: size }),
      fc.integer({ min: 1, max: 100000000 })
    ),
    { minLength: 1, maxLength: size }
  );

const arbOperations = (size: number) => {
  const arbIndex = fc.integer({ min: 0, max: size - 1 });
  // up to 5 bytes, so that carries and sets to smaller values span several sets
  const arbValue = fc.oneof(
    fc.integer({ min: 0, max: 300 }),
    fc.integer({ min: 0, max: 2 ** 40 })
  );
  return fc.array(
    fc.oneof(
      fc.record({
        type: fc.constant("add" as const),
        index: arbIndex,
        value: arbValue,
      }),
      fc.record({ type: fc.constant("increment" as const), index: arbIndex }),
      fc.record({
        type: fc.constant("set" as const),
        index: arbIndex,
        value: arbValue,
      }),
      fc.record({ type: fc.constant("get" as const), index: arbIndex })
    ),
    { minLength: 1, maxLength: 200 }
  );
};

/** Up to maxEntries (index, value) pairs over [0, size), values spanning several bytes */
const arbSparseData = (size: number, maxEntries: number) =>
  fc.array(
    fc.tuple(
      fc.integer({ min: 0, max: size - 1 }),
      fc.oneof(
        fc.integer({ min: 1, max: 255 }),
        fc.integer({ min: 256, max: 0xffffff }),
        fc.constant(256),
        fc.constant(0x10000)
      )
    ),
    { maxLength: maxEntries }
  );
