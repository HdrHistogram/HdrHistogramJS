import "core-js";
import { expect } from "chai";
import ByteBuffer from "./ByteBuffer";

describe("ByteBuffer", () => {
  it("should put value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(3);
    // when
    buffer.put(123);
    // then
    expect(buffer.data[0]).to.be.equal(123);
    expect(buffer.position).to.be.equal(1);
  });

  it("should resize when values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.put(123);
    // when
    buffer.put(42);
    // then
    expect(buffer.data[0]).to.be.equal(123);
    expect(buffer.data[1]).to.be.equal(42);
  });

  it("should get value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.put(123);
    buffer.resetPosition();
    // when
    const value = buffer.get();
    // then
    expect(value).to.be.equal(123);
    expect(buffer.position).to.be.equal(1);
  });

  it("should put int32 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    // when
    buffer.putInt32(123);
    // then
    expect(buffer.data[3]).to.be.equal(123);
    expect(buffer.position).to.be.equal(4);
  });

  it("should resize when int32 values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    // when
    buffer.putInt32(42);
    // then
    expect(buffer.data[3]).to.be.equal(42);
    expect(buffer.position).to.be.equal(4);
  });

  it("should get int32 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.putInt32(123);
    buffer.resetPosition();
    // when
    const value = buffer.getInt32();
    // then
    expect(value).to.be.equal(123);
    expect(buffer.position).to.be.equal(4);
  });

  it("should put int64 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    // when
    buffer.putInt64(123);
    // then
    expect(buffer.data[7]).to.be.equal(123);
    expect(buffer.position).to.be.equal(8);
  });

  it("should resize when int64 values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    // when
    buffer.putInt64(42);
    // then
    expect(buffer.data[7]).to.be.equal(42);
    expect(buffer.position).to.be.equal(8);
  });

  it("should get int64 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.putInt64(Number.MAX_SAFE_INTEGER);
    buffer.resetPosition();
    // when
    const value = buffer.getInt64();
    // then
    expect(value).to.be.equal(Number.MAX_SAFE_INTEGER);
    expect(buffer.position).to.be.equal(8);
  });

  it("should copy all data when putting array", () => {
    // given
    const buffer = ByteBuffer.allocate(1024);
    const array = new Uint8Array([1, 2, 3, 4]);
    // when
    buffer.putArray(array);
    // then
    buffer.resetPosition();
    expect(buffer.get()).to.be.equal(1);
    expect(buffer.get()).to.be.equal(2);
    expect(buffer.get()).to.be.equal(3);
    expect(buffer.get()).to.be.equal(4);
  });

  it("should resize when putting array bigger than capacity", () => {
    // given
    const buffer = ByteBuffer.allocate(1024);
    const array = new Uint8Array([1, 2, 3, 4]);
    // when
    buffer.position = 1022;
    buffer.putArray(array);
    // then
    buffer.position = 1022;
    expect(buffer.get()).to.be.equal(1);
    expect(buffer.get()).to.be.equal(2);
    expect(buffer.get()).to.be.equal(3);
    expect(buffer.get()).to.be.equal(4);
  });
});
