/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { FloatFormatter, IntegerFormatter } from "../formatters";

describe("Integer formatter", () => {
  it("should format integer as a string", () => {
    // given
    const formatter = new IntegerFormatter(3);
    // when
    const result = formatter.format(123);
    // then
    expect(result).toBe("123");
  });

  it("should add padding on the left when input has a few digits", () => {
    // given
    const formatter = new IntegerFormatter(5);
    // when
    const result = formatter.format(123);
    // then
    expect(result).toBe("  123");
  });
});

describe("Float formatter", () => {
  it("should format float as a string", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.34);
    // then
    expect(result).toBe("12.34");
  });

  it("should format float as a string with given number of fraction digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.347);
    // then
    expect(result).toBe("12.35");
  });

  it("should format float as a string with given number of fraction digits (bis)", () => {
    // given
    const formatter = new FloatFormatter(12, 3);
    // when
    const result = formatter.format(50);
    // then
    expect(result).toBe("      50.000");
  });

  it("should format float as a string adding fraction digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.3);
    // then
    expect(result).toBe("12.30");
  });

  it("should format the whole float input even with lots of digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12456789.34);
    // then
    expect(result).toBe("12456789.34");
  });

  it("should add padding on the left when not enough digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(9.34);
    // then
    expect(result).toBe(" 9.34");
  });
});
