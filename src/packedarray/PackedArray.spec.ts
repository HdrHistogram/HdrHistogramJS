/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import { PackedArrayContext } from "./PackedArrayContext";
import { PackedArray } from "./PackedArray";

const { pow } = Math;

describe("Packed array context", () => {
  it("Should initialize array", () => {
    const ctx = new PackedArrayContext(1024, 128);
    expect(ctx.isPacked).toBe(true);
    expect(ctx.getPopulatedShortLength()).toBeGreaterThan(0);
  });
});

describe("Packed array", () => {
  it("Should initialize array", () => {
    const array = new PackedArray(1024, 128);
    expect(array.getPhysicalLength()).toBe(128);
    expect(array.length()).toBe(1024);
  });

  it("Should retrieve data stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(16, 1);
    array.set(12, 42);

    // then
    expect(array.get(12)).toBe(42);
    expect(array.get(16)).toBe(1);
  });

  it("Should resize array when storing data", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(12, 361);

    // then
    const storedData = array.get(12);
    expect(storedData).toBe(361);
  });

  it("Should retrieve big numbers stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(12, Math.pow(2, 16) + 1);

    // then
    const storedData = array.get(12);
    expect(storedData).toBe(Math.pow(2, 16) + 1);
  });

  it("Should copy data when resizing array", () => {
    const array = new PackedArray(1024);
    for (let value = 1; value <= 272; value++) {
      array.set(value, value);
    }

    expect(array.get(1)).toBe(1);
    expect(array.get(255)).toBe(255);
    expect(array.get(272)).toBe(272);
  });

  it("Should increment data stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 1);

    // when
    array.add(16, 41);

    // then
    expect(array.get(16)).toBe(42);
  });

  it("Should increment data stored in array with big numbers", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.add(16, pow(2, 33));

    // then
    expect(array.get(16)).toBe(pow(2, 33) + 42);
  });

  it("Should increment data stored in array with big numbers when a resize is needed", () => {
    // given
    const array = new PackedArray(10000, 16);
    array.set(6144, 243);
    array.set(60, 243);
    array.set(1160, 243);

    // when
    array.add(6144, 25);

    // then
    expect(array.get(6144)).toBe(268);
  });

  it("Should increment data stored in array with big numbers", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.add(16, pow(2, 33));

    // then
    expect(array.get(16)).toBe(pow(2, 33) + 42);
  });

  it("Should clear data stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.clear();

    // then
    expect(array.get(16)).toBe(0);
  });

  it("Should resize array when virtual length change", () => {
    // given
    const array = new PackedArray(16, 16);
    array.set(7, 42);

    // when
    array.setVirtualLength(pow(2, 20));
    array.add(pow(2, 19), 42);

    // then
    expect(array.get(7)).toBe(42);
    expect(array.get(pow(2, 19))).toBe(42);
  });

  it("should handle properly big numbers", () => {
    // given
    const array = new PackedArray(45056, 16);
    // when
    array.set(32768, 1);
    // then
    expect(array.get(32768)).toBe(1);
    expect(array.get(0)).toBe(0);
  });
});

describe("Unpacked array", () => {
  it("Should increment data stored in array", () => {
    // given
    const array = new PackedArray(1024, pow(2, 20));
    array.set(16, 1);

    // when
    array.add(16, 41);

    // then
    expect(array.get(16)).toBe(42);
  });
});

describe("Packed array leaf cache", () => {
  it("Should carry across bytes", () => {
    const array = new PackedArray(1024, pow(2, 12));
    array.add(42, 200);
    array.add(42, 100);
    expect(array.get(42)).toBe(300);
  });

  it("Should keep interleaved reads and writes coherent inside a group", () => {
    const array = new PackedArray(1024, pow(2, 12));
    expect(array.get(8)).toBe(0); // caches group 1 as empty
    array.set(9, 5);
    array.set(8, 70000);
    expect(array.get(8)).toBe(70000);
    expect(array.get(9)).toBe(5);
    array.set(8, 3); // smaller value clears higher bytes
    expect(array.get(8)).toBe(3);
  });

  it("Should match a plain array on a random workload", () => {
    const size = 2048;
    const array = new PackedArray(size, pow(2, 14));
    const model = new Array<number>(size).fill(0);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let i = 0; i < 5000; i++) {
      const index = rnd() % size;
      const v = rnd() % 100000;
      if (rnd() % 2 === 0) {
        array.set(index, v);
        model[index] = v;
      } else {
        array.add(index, v);
        model[index] += v;
      }
      const probe = rnd() % size;
      expect(array.get(probe)).toBe(model[probe]);
    }
    for (let i = 0; i < size; i++) {
      expect(array.get(i)).toBe(model[i]);
    }
  });

  it("Should invalidate on clear and resize", () => {
    const array = new PackedArray(1024, pow(2, 12));
    array.set(3, 7);
    expect(array.get(3)).toBe(7);
    array.setVirtualLength(1 << 20);
    expect(array.get(3)).toBe(7);
    array.clear();
    expect(array.get(3)).toBe(0);
  });
});
