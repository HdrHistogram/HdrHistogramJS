/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * Mimic Java's ByteBufffer with big endian order
 */
class ByteBuffer {
  position: i32;

  data: Uint8Array;

  int64ArrayForConvert: Uint64Array;
  int32ArrayForConvert: Uint32Array;
  int8ArrayForConvertInt32: Uint8Array;
  int8ArrayForConvertInt64: Uint8Array;

  static allocate(size: i32 = 16): ByteBuffer {
    return new ByteBuffer(new Uint8Array(size));
  }

  constructor(data: Uint8Array) {
    this.position = 0;
    this.data = data;
    this.int64ArrayForConvert = new Uint64Array(1);
    this.int32ArrayForConvert = new Uint32Array(1);
    this.int8ArrayForConvertInt32 = Uint8Array.wrap(
      this.int32ArrayForConvert.buffer
    );
    this.int8ArrayForConvertInt64 = Uint8Array.wrap(
      this.int64ArrayForConvert.buffer
    );
  }

  put(value: u8): void {
    if (this.position === this.data.length) {
      const oldArray = this.data;
      this.data = new Uint8Array(this.data.length << 1);
      this.data.set(oldArray);
    }
    unchecked((this.data[this.position] = value));
    this.position++;
  }

  putInt32(value: u32): void {
    if (this.data.length - this.position < 4) {
      const oldArray = this.data;
      this.data = new Uint8Array((this.data.length << 1) + 4);
      this.data.set(oldArray);
    }
    unchecked((this.int32ArrayForConvert[0] = value));
    this.data.set(this.int8ArrayForConvertInt32.reverse(), this.position);
    this.position += 4;
  }

  putInt64(value: u64): void {
    if (this.data.length - this.position < 8) {
      const oldArray = this.data;
      this.data = new Uint8Array((this.data.length << 1) + 8);
      this.data.set(oldArray);
    }
    unchecked((this.int64ArrayForConvert[0] = value));
    this.data.set(this.int8ArrayForConvertInt64.reverse(), this.position);
    this.position += 8;
  }

  putArray(array: Uint8Array): void {
    if (this.data.length - this.position < array.byteLength) {
      const oldArray = this.data;
      this.data = new Uint8Array(this.position + array.byteLength);
      this.data.set(oldArray);
    }
    this.data.set(array, this.position);
    this.position += array.byteLength;
  }

  get(): u8 {
    const value = unchecked(this.data[this.position]);
    this.position++;
    return value;
  }

  getInt32(): u32 {
    this.int8ArrayForConvertInt32.set(
      this.data.slice(this.position, this.position + 4).reverse()
    );
    const value = unchecked(this.int32ArrayForConvert[0]);
    this.position += 4;
    return value;
  }

  getInt64(): u64 {
    this.int8ArrayForConvertInt64.set(
      this.data.slice(this.position, this.position + 8).reverse()
    );
    const value = unchecked(this.int64ArrayForConvert[0]);
    this.position += 8;
    return value;
  }

  resetPosition(): void {
    this.position = 0;
  }
}

export default ByteBuffer;
