import "core-js"
import { expect } from "chai";
import ByteBuffer from "./ByteBuffer";
import ZigZagEncoding from "./ZigZagEncoding";

describe('Zig Zag Encoding', () => {
  
  it("should encode int using one byte when value is less than 64", () => {
    // given
    const buffer = new ByteBuffer(1);
    // when
    ZigZagEncoding.encodeInt32(buffer, 56);
    // then
    expect(buffer.data).to.have.length(1);
    expect(buffer.data[0]).to.equals(112);
  });

  it("should encode int using several bytes when value is more than 64", () => {
    // given
    const buffer = new ByteBuffer(1);
    // when
    ZigZagEncoding.encodeInt32(buffer, 456);
    // then
    expect(buffer.data).to.have.length(2);
    expect(Array.from(buffer.data)).to.deep.equals([ 144, 7 ]);
  });

  it("should decode int using one byte", () => {
    // given
    const buffer = new ByteBuffer(8);
    ZigZagEncoding.encodeInt32(buffer, 56);
    buffer.resetIndex();
    // when
    const value = ZigZagEncoding.decodeInt32(buffer);
    // then
    expect(value).to.equals(56);
  });

  it("should decode int using multiple bytes", () => {
    // given
    const buffer = new ByteBuffer(8);
    ZigZagEncoding.encodeInt32(buffer, 1515);
    ZigZagEncoding.encodeInt32(buffer, 56);
    buffer.resetIndex();
    // when
    const value = ZigZagEncoding.decodeInt32(buffer);
    // then
    expect(value).to.equals(1515);
  });

});