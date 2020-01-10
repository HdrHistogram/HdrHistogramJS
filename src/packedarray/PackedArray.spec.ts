/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import "core-js";
import { expect } from "chai";
import { PackedArrayContext } from "./PackedArrayContext";
import { PackedArray } from "./PackedArray";

const { pow } = Math;

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
    const array = new PackedArray(1024, 16);

    // when
    array.set(16, 1);
    array.set(12, 42);

    // then
    expect(array.get(12)).to.be.equal(42);
    expect(array.get(16)).to.be.equal(1);
  });

  it("Should resize array when storing data", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(12, 361);

    // then
    const storedData = array.get(12);
    expect(storedData).to.be.equal(361);
  });

  it("Should retrieve big numbers stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);

    // when
    array.set(12, Math.pow(2, 16) + 1);

    // then
    const storedData = array.get(12);
    expect(storedData).to.be.equal(Math.pow(2, 16) + 1);
  });

  it("Should copy data when resizing array", () => {
    const array = new PackedArray(1024);
    for (let value = 1; value <= 272; value++) {
      array.set(value, value);
    }

    for (let value = 256; value <= 272; value++) {
      expect(array.get(value)).to.be.equal(value);
    }
  });

  it("Should increment data stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 1);

    // when
    array.add(16, 41);

    // then
    expect(array.get(16)).to.be.equal(42);
  });

  it("Should increment data stored in array with big numbers", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.add(16, pow(2, 33));

    // then
    expect(array.get(16)).to.be.equal(pow(2, 33) + 42);
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
    expect(array.get(6144)).to.be.equal(268);
  });

  it("Should increment data stored in array with big numbers", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.add(16, pow(2, 33));

    // then
    expect(array.get(16)).to.be.equal(pow(2, 33) + 42);
  });

  it("Should clear data stored in array", () => {
    // given
    const array = new PackedArray(1024, 16);
    array.set(16, 42);

    // when
    array.clear();

    // then
    expect(array.get(16)).to.be.equal(0);
  });
});
