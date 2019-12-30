import "core-js";
import { expect } from "chai";
import { PackedArrayContext } from "./PackedArrayContext";
import { PackedArray } from "./PackedArray";

describe("Packed array context", () => {
  it("Should initialize array", () => {
    const ctx = new PackedArrayContext(1024, 128);
    expect(ctx.isPacked).to.be.true;
    expect(ctx.getPopulatedShortLength()).to.be.greaterThan(0);
  });
});

describe("Packed array", () => {
  it("Should initialize array", () => {
    const array = new PackedArray(1024, 128);
    expect(array.getPhysicalLength()).to.equal(128);
    expect(array.length()).to.equal(1024);
  });

  it("Should retrieve data stored in array", () => {
    // given
    const array = new PackedArray(4024, 16);

    // when
    array.set(122, 42);

    // then
    const storedData = array.get(122);
    expect(storedData).to.be.equal(42);
  });

  it("Should resize array when storing data", () => {
    // given
    const array = new PackedArray(4024, 16);

    // when
    array.set(12, 360);

    // then
    const storedData = array.get(12);
    expect(storedData).to.be.equal(360);
  });

  it("Should retrieve big numbers stored in array", () => {
    // given
    const array = new PackedArray(4024, 16);

    // when
    array.set(12, Math.pow(2, 16) + 1);

    // then
    const storedData = array.get(12);
    expect(storedData).to.be.equal(Math.pow(2, 16) + 1);
  });
});
