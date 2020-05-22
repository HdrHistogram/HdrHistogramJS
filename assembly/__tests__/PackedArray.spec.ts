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

  it("should nehave like an array", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array[12] = 4242;

    // then
    expect(array[12]).toBe(4242);
  });
});
