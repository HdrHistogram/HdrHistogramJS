import { bitCount } from "../packedarray/bitcount";

describe("bit count", () => {
  it("should count bits", () => {
    expect<u8>(bitCount(8)).toBe(1);
    expect<u8>(bitCount(40)).toBe(2);
    expect<u8>(bitCount((u64.MAX_VALUE >> 1) + 1)).toBe(1);
  });
});
