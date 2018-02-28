import "core-js";
import { expect } from "chai";
import ByteBuffer from "./ByteBuffer";
import ZigZagEncoding from "./ZigZagEncoding";

describe("Zig Zag Encoding", () => {
  it("should encode int using one byte when value is less than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 56);
    // then
    expect(buffer.data).to.have.length(4);
    expect(buffer.data[0]).to.equals(112);
  });

  it("should encode int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 456);
    // then
    expect(buffer.data).to.have.length(4);
    expect(Array.from(buffer.data)).to.deep.equals([144, 7, 0, 0]);
  });

  it("should encode negative int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, -456);
    // then
    expect(buffer.data).to.have.length(4);
    expect(Array.from(buffer.data)).to.deep.equals([143, 7, 0, 0]);
  });

  it("should encode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, Math.pow(2, 50));
    // then
    expect(buffer.data).to.have.length(8);
    expect(Array.from(buffer.data)).to.deep.equals([
      128,
      128,
      128,
      128,
      128,
      128,
      128,
      4
    ]);
  });

  it("should decode int using one byte", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).to.equals(56);
  });

  it("should decode int using multiple bytes", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, 70000);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).to.equals(70000);
  });

  it("should decode negative int using multiple bytes", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, -1515);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).to.equals(-1515);
  });

  it("should decode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    ZigZagEncoding.encode(buffer, Math.pow(2, 50) + 1234);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).to.equals(Math.pow(2, 50) + 1234);
  });
});
