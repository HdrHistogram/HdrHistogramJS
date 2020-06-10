/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import ByteBuffer from "../ByteBuffer";
import ZigZagEncoding from "../ZigZagEncoding";

describe("Zig Zag Encoding", () => {
  it("should encode int using one byte when value is less than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 56);
    // then
    expect(buffer.data).toHaveLength(4);
    expect(buffer.data[0]).toBe(112);
  });

  it("should encode int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 456);
    // then
    expect(buffer.data).toHaveLength(4);
    expect(buffer.data[0]).toBe(144);
    expect(buffer.data[1]).toBe(7);
    expect(buffer.data[2]).toBe(0);
    expect(buffer.data[3]).toBe(0);
  });

  it("should encode negative int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, -456);
    // then
    expect(buffer.data).toHaveLength(4);
    expect(buffer.data[0]).toBe(143);
    expect(buffer.data[1]).toBe(7);
    expect(buffer.data[2]).toBe(0);
    expect(buffer.data[3]).toBe(0);
  });

  it("should encode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, <i64>Math.pow(2, 50));
    // then
    expect(buffer.data).toHaveLength(8);
    expect(buffer.data[0]).toBe(128);
    expect(buffer.data[1]).toBe(128);
    expect(buffer.data[2]).toBe(128);
    expect(buffer.data[3]).toBe(128);
    expect(buffer.data[4]).toBe(128);
    expect(buffer.data[5]).toBe(128);
    expect(buffer.data[6]).toBe(128);
    expect(buffer.data[7]).toBe(4);
  });

  it("should decode int using one byte", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).toBe(56);
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
    expect(value).toBe(70000);
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
    expect(value).toBe(-1515);
  });

  it("should decode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    ZigZagEncoding.encode(buffer, <i64>(Math.pow(2, 50) + 1234));
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).toBe(<i64>Math.pow(2, 50) + 1234);
  });
});
