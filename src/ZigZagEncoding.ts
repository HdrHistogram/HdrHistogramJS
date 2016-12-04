/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import ByteBuffer from "./ByteBuffer";

/**
 * This class provides encoding and decoding methods for writing and reading
 * ZigZag-encoded LEB128-64b9B-variant (Little Endian Base 128) values to/from a
 * {@link ByteBuffer}. LEB128's variable length encoding provides for using a
 * smaller nuber of bytes for smaller values, and the use of ZigZag encoding
 * allows small (closer to zero) negative values to use fewer bytes. Details
 * on both LEB128 and ZigZag can be readily found elsewhere.
 *
 * The LEB128-64b9B-variant encoding used here diverges from the "original"
 * LEB128 as it extends to 64 bit values: In the original LEB128, a 64 bit
 * value can take up to 10 bytes in the stream, where this variant's encoding
 * of a 64 bit values will max out at 9 bytes.
 *
 * As such, this encoder/decoder should NOT be used for encoding or decoding
 * "standard" LEB128 formats (e.g. Google Protocol Buffers).
 */
class ZigZagEncoding {

  /**
   * Writes an int value to the given buffer in LEB128-64b9B ZigZag encoded format
   * @param buffer the buffer to write to
   * @param value  the value to write to the buffer
   */
  static encodeInt32(buffer: ByteBuffer, value: number) {
    value = (value << 1) ^ (value >> 31);
    if (value >>> 7 === 0) {
      buffer.put(value);
    } else {
      buffer.put((value & 0x7F) | 0x80);
      if (value >>> 14 == 0) {
        buffer.put(value >>> 7);
      } else {
        buffer.put(value >>> 7 | 0x80);
        if (value >>> 21 == 0) {
          buffer.put(value >>> 14);
        } else {
          buffer.put(value >>> 14 | 0x80);
          if (value >>> 28 == 0) {
            buffer.put(value >>> 21);
          } else {
            buffer.put(value >>> 21 | 0x80);
            buffer.put(value >>> 28);
          }
        }
      }
    }
  }

  /**
   * Read an LEB128-64b9B ZigZag encoded int value from the given buffer
   * @param buffer the buffer to read from
   * @return the value read from the buffer
   */
  static decodeInt32(buffer: ByteBuffer): number {
    let v = buffer.get();
    let value = v & 0x7F;
    if ((v & 0x80) != 0) {
      v = buffer.get();
      value |= (v & 0x7F) << 7;
      if ((v & 0x80) != 0) {
        v = buffer.get();
        value |= (v & 0x7F) << 14;
        if ((v & 0x80) != 0) {
          v = buffer.get();
          value |= (v & 0x7F) << 21;
          if ((v & 0x80) != 0) {
            v = buffer.get();
            value |= (v & 0x7F) << 28;
          }
        }
      }
    }
    value = (value >>> 1) ^ (-(value & 1));
    return value;
  }
}

export default ZigZagEncoding;