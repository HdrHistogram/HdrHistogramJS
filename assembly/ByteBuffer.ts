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
  view: DataView;

  static allocate(size: i32 = 16): ByteBuffer {
    return new ByteBuffer(new Uint8Array(size));
  }

  constructor(data: Uint8Array) {
    this.position = 0;
    this.data = data;
    this.view = new DataView(data.buffer);
  }

  public resize(newSize: i32): ByteBuffer {

    const buf = new Uint8Array(newSize);
    buf.set(this.data);

    this.data = buf;
    this.view = new DataView(buf.buffer);

    return this;
  }

  put(value: u8): void {
    if (this.position === this.data.length) {
      this.resize(this.data.length << 1);
    }
    this.view.setUint8(this.position, value);
    this.position++;
  }

  putInt32(value: u32): void {
    if (this.data.length - this.position < 4) {
      this.resize((this.data.length << 1) + 4);
    }
    this.view.setUint32(this.position, value, false);
    this.position += 4;
  }

  putInt64(value: u64): void {
    if (this.data.length - this.position < 8) {
      this.resize((this.data.length << 1) + 8);
    }
    this.view.setUint64(this.position, value, false);
    this.position += 8;
  }

  putArray(array: Uint8Array): void {
    if (this.data.length - this.position < array.byteLength) {
      this.resize(this.position + array.byteLength);
    }
    this.data.set(array, this.position);
    this.position += array.byteLength;
  }

  @inline
  get(): u8 {
    const value = unchecked(this.view.getUint8(this.position));
    this.position++;
    return value;
  }

  @inline
  getInt32(): u32 {
    const value =  unchecked(this.view.getUint32(this.position, false));
    this.position += 4;
    return value;
  }

  @inline
  getInt64(): u64 {
    const value = unchecked(this.view.getUint64(this.position, false));
    this.position += 8;
    return value;
  }

  resetPosition(): void {
    this.position = 0;
  }
}

export default ByteBuffer;
