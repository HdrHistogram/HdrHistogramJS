import * as fc from "fast-check";
import { PackedArray } from "./PackedArray";
import { WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH } from "./PackedArrayContext";

// Set 0 of a packed array uses 16 byte leaves: these tests cover the resize, sharing,
// fallback and iteration paths that the wider leaves change.
describe("Packed array with 16 byte leaves for set 0", () => {
  // Deterministic PRNG, so that failures reproduce
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  it("should keep values when a resize changes the depth of the set trees", () => {
    // given: the set 0 tree gets one more level past 2^12, the others past 2^10
    const array = new PackedArray(1000, 16);
    const values = new Map<number, number>([
      [0, 1],
      [17, 300],
      [255, 70000],
      [700, 2 ** 40 + 5],
      [999, 42],
    ]);
    values.forEach((value, index) => array.set(index, value));

    // when
    array.setVirtualLength(8192);
    array.set(8000, 5);

    // then
    values.forEach((value, index) => expect(array.get(index)).toBe(value));
    expect(array.get(8000)).toBe(5);
    expect(array.get(4096)).toBe(0);
  });

  it("should share one leaf between the indexes of a 16 index block", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 1);
    const physicalLength = array.getPhysicalLength();

    // when: the other 15 indexes of the block are written, in both 8 index groups
    for (let index = 17; index < 32; index++) {
      array.set(index, index);
    }

    // then
    expect(array.getPhysicalLength()).toBe(physicalLength);
    expect(array.get(16)).toBe(1);
    for (let index = 17; index < 32; index++) {
      expect(array.get(index)).toBe(index);
    }
  });

  it("should not allocate leaves when setting zeros", () => {
    // given
    const array = new PackedArray(1 << 12, 16);
    const physicalLength = array.getPhysicalLength();

    // when
    for (let index = 0; index < 1 << 12; index++) {
      array.set(index, 0);
    }

    // then
    expect(array.getPhysicalLength()).toBe(physicalLength);
    expect(array.get(1234)).toBe(0);
  });

  it("should iterate over the non zero values of a sparse array", () => {
    // given
    const array = new PackedArray(1 << 12, 16);
    const expected = [3, 16, 31, 32, 1000, 1015, 4095];
    expected.forEach((index) => array.increment(index));

    // when
    const nonZero: number[] = [];
    for (let index = 0; index < array.length(); index++) {
      if (array.get(index) !== 0) {
        nonZero.push(index);
      }
    }

    // then
    expect(nonZero).toEqual(expected);
  });

  it("should keep values once the packed storage falls back to unpacked", () => {
    // given: isolated values, one leaf each, until the 16 bit addresses run out
    const length = 1 << 16;
    const array = new PackedArray(length, 16);
    const values = new Map<number, number>();
    for (let i = 0; i < 20000 && array.getPhysicalLength() <= 8191; i++) {
      const index = (i * 7919) % length;
      array.add(index, i + 1);
      values.set(index, (values.get(index) ?? 0) + i + 1);
    }

    // then
    expect(array.getPhysicalLength()).toBeGreaterThan(8191);
    values.forEach((value, index) => expect(array.get(index)).toBe(value));
  });

  it("should keep set 0 coherent when alternating between the two groups of a 16 index block", () => {
    // given: group 0 is cached with no leaf, then group 1 of the same block gets one
    const array = new PackedArray(1024, 16);
    expect(array.get(3)).toBe(0);
    array.set(9, 5);

    // when / then: back to group 0 of the block, which now shares the leaf
    expect(array.get(3)).toBe(0);
    expect(array.get(9)).toBe(5);
    array.add(2, 7);
    expect(array.get(2)).toBe(7);
    expect(array.get(9)).toBe(5);
    array.set(1, 0);
    expect(array.get(1)).toBe(0);
  });

  it("should match a plain array on random operations within a 16 index block", () => {
    const rand = seeded(77);
    for (let round = 0; round < 50; round++) {
      // given: a small range, where most accesses switch between the two groups
      const length = 64;
      const array = new PackedArray(length, 16);
      const plain = new Float64Array(length);
      for (let k = 0; k < 2000; k++) {
        const index = Math.floor(rand() * length);
        const op = rand();
        if (op < 0.4) {
          const value = 1 + Math.floor(rand() * 300);
          array.add(index, value);
          plain[index] += value;
        } else if (op < 0.5) {
          array.set(index, 0);
          plain[index] = 0;
        } else {
          expect(array.get(index)).toBe(plain[index]);
        }
      }
      for (let index = 0; index < length; index++) {
        expect(array.get(index)).toBe(plain[index]);
      }
    }
  });

  it("should match a plain array across the depth thresholds of the set trees", () => {
    const rand = seeded(2024);
    for (const length of [1000, 4096, 4097, 8192, 8193, 40000]) {
      // given
      const array = new PackedArray(length, 16);
      const plain = new Float64Array(length);

      // when: a hot band, isolated values, carries into the next sets
      for (let k = 0; k < 20000; k++) {
        const index =
          rand() < 0.5
            ? Math.min(length - 1, 100 + Math.floor(rand() * 40))
            : Math.floor(rand() * length);
        const value = rand() < 0.2 ? 250 + Math.floor(rand() * 10) : 1;
        array.add(index, value);
        plain[index] += value;
      }

      // then
      for (let index = 0; index < length; index++) {
        if (array.get(index) !== plain[index]) {
          throw new Error(
            `length ${length}: index ${index} is ${array.get(index)}, expected ${plain[index]}`
          );
        }
      }
    }
  });
});

// Set 0 leaves are 16 bytes up to WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH, and 8 bytes above it:
// a resize across that threshold changes the layout of set 0.
describe("Packed array across the wide set 0 threshold", () => {
  const WIDE_MAX = WIDE_SET_0_LEAVES_MAX_VIRTUAL_LENGTH;
  const runFromStryker = __dirname.includes("stryker");
  const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  it("should keep counts when a resize moves set 0 to 8 byte leaves", () => {
    // given: values in both groups of a block, the last index of a wide length
    const array = new PackedArray(WIDE_MAX, 16);
    const values = new Map<number, number>([
      [0, 1],
      [9, 300],
      [16, 7],
      [1000, 2 ** 40 + 5],
      [WIDE_MAX - 1, 70000],
    ]);
    values.forEach((value, index) => array.set(index, value));

    // when
    array.setVirtualLength(WIDE_MAX + 1);

    // then
    values.forEach((value, index) => expect(array.get(index)).toBe(value));
    expect(array.get(WIDE_MAX)).toBe(0);
    array.set(WIDE_MAX, 9);
    expect(array.get(WIDE_MAX)).toBe(9);
  });

  it("should keep a value whose low byte is zero across a resize over the threshold", () => {
    // given: 256 only sets byte 1, the set 0 leaf exists with a zero byte
    const array = new PackedArray(WIDE_MAX, 16);
    array.set(0, 256);

    // when
    array.setVirtualLength(WIDE_MAX + 1);

    // then
    expect(array.get(0)).toBe(256);
  });

  it("should keep the cached group coherent across a resize over the threshold", () => {
    // given: group 2 is cached, with a leaf for its set 0 in the wide layout
    const array = new PackedArray(WIDE_MAX, 16);
    array.set(16, 5);
    expect(array.get(17)).toBe(0);

    // when: the resize changes the set 0 layout while group 2 is cached
    array.setVirtualLength(WIDE_MAX + 1);

    // then: the cached group is walked again in the new layout
    expect(array.get(17)).toBe(0);
    array.set(17, 3);
    expect(array.get(16)).toBe(5);
    expect(array.get(17)).toBe(3);
    expect(array.get(18)).toBe(0);
    expect(array.get(24)).toBe(0);
  });

  it("should keep values when a resize follows a nearly full packed storage", () => {
    // given: isolated values until the packed storage nearly runs out, at a wide length
    const array = new PackedArray(WIDE_MAX, 16);
    const values = new Map<number, number>();
    for (let i = 0; i < 20000 && array.getPhysicalLength() < 8000; i++) {
      const index = (i * 7919) % WIDE_MAX;
      array.add(index, i + 1);
      values.set(index, (values.get(index) ?? 0) + i + 1);
    }

    // when: the narrower leaves may not fit in the remaining storage
    array.setVirtualLength(WIDE_MAX + 1);

    // then: packed or unpacked, the values are kept
    values.forEach((value, index) => expect(array.get(index)).toBe(value));
    expect(array.get(WIDE_MAX)).toBe(0);
  });

  it("should match a plain array in both widths of set 0 leaves", () => {
    const rand = seeded(5);
    for (const length of [1000, WIDE_MAX, WIDE_MAX + 1, 40000]) {
      // given
      const array = new PackedArray(length, 16);
      const plain = new Float64Array(length);

      // when: a hot band that shares blocks, isolated values, and carries
      for (let k = 0; k < 5000; k++) {
        const index =
          rand() < 0.5
            ? Math.min(length - 1, 100 + Math.floor(rand() * 40))
            : Math.floor(rand() * length);
        const value = rand() < 0.2 ? 250 + Math.floor(rand() * 10) : 1;
        array.add(index, value);
        plain[index] += value;
      }

      // then
      for (let index = 0; index < length; index++) {
        expect(array.get(index)).toBe(plain[index]);
      }
    }
  });

  it("should match a plain array across resizes over the threshold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: WIDE_MAX - 300, max: WIDE_MAX }),
        fc.array(
          fc.tuple(
            fc.constantFrom("add", "set", "get", "resize"),
            fc.nat(1 << 20),
            fc.nat(1000)
          ),
          { maxLength: 300 }
        ),
        (startLength, ops) => {
          let length = startLength;
          const array = new PackedArray(length, 16);
          const plain: number[] = new Array(length).fill(0);
          for (const [kind, rawIndex, amount] of ops) {
            if (kind === "resize") {
              const grown = length + 1 + (amount % 64) * 8;
              array.setVirtualLength(grown);
              for (let i = length; i < grown; i++) plain.push(0);
              length = grown;
              continue;
            }
            const index = rawIndex % length;
            if (kind === "add") {
              array.add(index, amount + 1);
              plain[index] += amount + 1;
            } else if (kind === "set") {
              const value = amount % 3 === 0 ? 0 : amount;
              array.set(index, value);
              plain[index] = value;
            } else {
              expect(array.get(index)).toBe(plain[index]);
            }
          }
          for (let index = 0; index < length; index++) {
            expect(array.get(index)).toBe(plain[index]);
          }
        }
      ),
      { numRuns: runFromStryker ? 10 : 300 }
    );
  });
});
