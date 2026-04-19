/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import { FloatFormatter, IntegerFormatter } from "../formatters";

describe("Integer formatter", () => {
  test("should format integer as a string", () => {
    // given
    const formatter = new IntegerFormatter(3);
    // when
    const result = formatter.format(123);
    // then
    expect(result).equal("123");
  });

  test("should add padding on the left when input has a few digits", () => {
    // given
    const formatter = new IntegerFormatter(5);
    // when
    const result = formatter.format(123);
    // then
    expect(result).equal("  123");
  });
});

describe("Float formatter", () => {
  test("should format float as a string", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.34);
    // then
    expect(result).equal("12.34");
  });

  test("should format float as a string with given number of fraction digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.347);
    // then
    expect(result).equal("12.35");
  });

  test("should format float as a string with given number of fraction digits (bis)", () => {
    // given
    const formatter = new FloatFormatter(12, 3);
    // when
    const result = formatter.format(50);
    // then
    expect(result).equal("      50.000");
  });

  test("should format float as a string adding fraction digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12.3);
    // then
    expect(result).equal("12.30");
  });

  test("should format the whole float input even with lots of digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(12456789.34);
    // then
    expect(result).equal("12456789.34");
  });

  test("should add padding on the left when not enough digits", () => {
    // given
    const formatter = new FloatFormatter(5, 2);
    // when
    const result = formatter.format(9.34);
    // then
    expect(result).equal(" 9.34");
  });
});
