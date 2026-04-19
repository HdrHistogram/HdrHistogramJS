/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import { describe, test, expect } from "assemblyscript-unittest-framework/assembly";
import ByteBuffer from "../ByteBuffer";

describe("ByteBuffer", () => {
  test("should put value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(3);
    // when
    buffer.put(<u8>123);
    // then
    expect<u8>(buffer.data[0]).equal(123);
    expect<i32>(buffer.position).equal(1);
  });

  test("should resize when values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.put(<u8>123);
    // when
    buffer.put(<u8>42);
    // then
    expect<u8>(buffer.data[0]).equal(123);
    expect(buffer.data[1]).equal(42);
  });

  test("should get value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.put(123);
    buffer.resetPosition();
    // when
    const value = buffer.get();
    // then
    expect(value).equal(123);
    expect(buffer.position).equal(1);
  });

  test("should put int32 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    // when
    buffer.putInt32(123);
    // then
    expect(buffer.data[3]).equal(123);
    expect(buffer.position).equal(4);
  });

  test("should resize when int32 values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    // when
    buffer.putInt32(42);
    // then
    expect(buffer.data[3]).equal(42);
    expect(buffer.position).equal(4);
  });

  test("should get int32 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.putInt32(123);
    buffer.resetPosition();
    // when
    const value = buffer.getInt32();
    // then
    expect(value).equal(123);
    expect(buffer.position).equal(4);
  });

  test("should put int64 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(8);
    // when
    buffer.putInt64(123);
    // then
    expect(buffer.data[7]).equal(123);
    expect(buffer.position).equal(8);
  });

  test("should resize when int64 values overflow ", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    // when
    buffer.putInt64(42);
    // then
    expect(buffer.data[7]).equal(42);
    expect(buffer.position).equal(8);
  });

  test("should get int64 value moving the position", () => {
    // given
    const buffer = ByteBuffer.allocate(1);
    buffer.putInt64(u64.MAX_VALUE);
    buffer.resetPosition();
    // when
    const value = buffer.getInt64();
    // then
    expect(value).equal(u64.MAX_VALUE);
    expect(buffer.position).equal(8);
  });

  test("should copy all data when putting array", () => {
    // given
    const buffer = ByteBuffer.allocate(1024);
    const array = new Uint8Array(4);
    for (let index = 0; index < array.length; index++) {
      array[index] = <u8>(index + 1);
    }
    // when
    buffer.putArray(array);
    // then
    buffer.resetPosition();
    expect(buffer.get()).equal(1);
    expect(buffer.get()).equal(2);
    expect(buffer.get()).equal(3);
    expect(buffer.get()).equal(4);
  });

  test("should resize when putting array bigger than capacity", () => {
    // given
    const buffer = ByteBuffer.allocate(1024);
    const array = new Uint8Array(4);
    for (let index = 0; index < array.length; index++) {
      array[index] = <u8>(index + 1);
    }
    // when
    buffer.position = 1022;
    buffer.putArray(array);
    // then
    buffer.position = 1022;
    expect(buffer.get()).equal(1);
    expect(buffer.get()).equal(2);
    expect(buffer.get()).equal(3);
    expect(buffer.get()).equal(4);
  });
});
