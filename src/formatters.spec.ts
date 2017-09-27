import "core-js";
import { expect } from "chai";
import { integerFormatter, floatFormatter } from "./formatters";

describe("Integer formatter", () => {
  it("should format integer as a string", () => {
    // given
    const formatter = integerFormatter(3);
    // when
    const result = formatter(123);
    // then
    expect(result).to.be.equal("123");
  });

  it("should add padding on the left when input has a few digits", () => {
    // given
    const formatter = integerFormatter(5);
    // when
    const result = formatter(123);
    // then
    expect(result).to.be.equal("  123");
  });
});

describe("Float formatter", () => {
  it("should format float as a string", () => {
    // given
    const formatter = floatFormatter(5, 2);
    // when
    const result = formatter(12.34);
    // then
    expect(result).to.be.equal("12.34");
  });

  it("should format float as a string with given number of fraction digits", () => {
    // given
    const formatter = floatFormatter(5, 2);
    // when
    const result = formatter(12.342);
    // then
    expect(result).to.be.equal("12.34");
  });

  it("should format float as a string adding fraction digits", () => {
    // given
    const formatter = floatFormatter(5, 2);
    // when
    const result = formatter(12.3);
    // then
    expect(result).to.be.equal("12.30");
  });

  it("should format the whole float input even with lots of digits", () => {
    // given
    const formatter = floatFormatter(5, 2);
    // when
    const result = formatter(12456789.34);
    // then
    expect(result).to.be.equal("12456789.34");
  });

  it("should add padding on the left when not enough digits", () => {
    // given
    const formatter = floatFormatter(5, 2);
    // when
    const result = formatter(9.34);
    // then
    expect(result).to.be.equal(" 9.34");
  });
});
