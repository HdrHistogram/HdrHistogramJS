/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import ByteBuffer from "../ByteBuffer";
import ZigZagEncoding from "../ZigZagEncoding";

describe("Zig Zag Encoding", () => {
  test("should encode int using one byte when value is less than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 56);
    // then
    expect<i32>(buffer.data.length).equal(4);
    expect(buffer.data[0]).equal(112);
  });

  test("should encode int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, 456);
    // then
    expect<i32>(buffer.data.length).equal(4);
    expect(buffer.data[0]).equal(144);
    expect(buffer.data[1]).equal(7);
    expect(buffer.data[2]).equal(0);
    expect(buffer.data[3]).equal(0);
  });

  test("should encode negative int using several bytes when value is more than 64", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, -456);
    // then
    expect<i32>(buffer.data.length).equal(4);
    expect(buffer.data[0]).equal(143);
    expect(buffer.data[1]).equal(7);
    expect(buffer.data[2]).equal(0);
    expect(buffer.data[3]).equal(0);
  });

  test("should encode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    // when
    ZigZagEncoding.encode(buffer, <i64>Math.pow(2, 50));
    // then
    expect<i32>(buffer.data.length).equal(8);
    expect(buffer.data[0]).equal(128);
    expect(buffer.data[1]).equal(128);
    expect(buffer.data[2]).equal(128);
    expect(buffer.data[3]).equal(128);
    expect(buffer.data[4]).equal(128);
    expect(buffer.data[5]).equal(128);
    expect(buffer.data[6]).equal(128);
    expect(buffer.data[7]).equal(4);
  });

  test("should decode int using one byte", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).equal(56);
  });

  test("should decode int using multiple bytes", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, 70000);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).equal(70000);
  });

  test("should decode negative int using multiple bytes", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    ZigZagEncoding.encode(buffer, -1515);
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).equal(-1515);
  });

  test("should decode large safe int greater than 2^32", () => {
    // given
    const buffer = ByteBuffer.allocate(4);
    ZigZagEncoding.encode(buffer, <i64>(Math.pow(2, 50) + 1234));
    ZigZagEncoding.encode(buffer, 56);
    buffer.resetPosition();
    // when
    const value = ZigZagEncoding.decode(buffer);
    // then
    expect(value).equal(<i64>Math.pow(2, 50) + 1234);
  });
});
