/*
 * This is a AssemblyScript port of the original Java version, which was written by
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
   * Writes a 64b value to the given buffer in LEB128 ZigZag encoded format
   * (negative numbers not supported)
   * @param buffer the buffer to write to
   * @param value  the value to write to the buffer
   */
  static encode(buffer: ByteBuffer, value: i64): void {
    value = (value << 1) ^ (value >> 63);
    if (value >>> 7 === 0) {
      buffer.put(<u8>value);
    } else {
      buffer.put(<u8>((value & 0x7f) | 0x80));
      if (value >>> 14 === 0) {
        buffer.put(<u8>(value >>> 7));
      } else {
        buffer.put(<u8>((value >>> 7) | 0x80));
        if (value >>> 21 === 0) {
          buffer.put(<u8>(value >>> 14));
        } else {
          buffer.put(<u8>((value >>> 14) | 0x80));
          if (value >>> 28 === 0) {
            buffer.put(<u8>(value >>> 21));
          } else {
            buffer.put(<u8>((value >>> 21) | 0x80));
            if (value >>> 35 === 0) {
              buffer.put(<u8>(value >>> 28));
            } else {
              buffer.put(<u8>((value >>> 28) | 0x80));
              if (value >>> 42 === 0) {
                buffer.put(<u8>(value >>> 35));
              } else {
                buffer.put(<u8>((value >>> 35) | 0x80));
                if (value >>> 49 === 0) {
                  buffer.put(<u8>(value >>> 42));
                } else {
                  buffer.put(<u8>((value >>> 42) | 0x80));
                  if (value >>> 56 === 0) {
                    buffer.put(<u8>(value >>> 49));
                  } else {
                    buffer.put(<u8>((value >>> 49) | 0x80));
                    buffer.put(<u8>(value >>> 56));
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Read an LEB128-64b9B ZigZag encoded long value from the given buffer
   * (negative numbers not supported)
   * @param buffer the buffer to read from
   * @return the value read from the buffer
   */
  static decode(buffer: ByteBuffer): i64 {
    let v = <i64>buffer.get();
    let value: i64 = (<i64>v) & (<i64>0x7f);
    if ((v & 0x80) != 0) {
      v = buffer.get();
      value |= (v & 0x7f) << 7;
      if ((v & 0x80) != 0) {
        v = buffer.get();
        value |= (v & 0x7f) << 14;
        if ((v & 0x80) != 0) {
          v = buffer.get();
          value |= (v & 0x7f) << 21;
          if ((v & 0x80) != 0) {
            v = buffer.get();
            value |= (v & 0x7f) << 28;
            if ((v & 0x80) != 0) {
              v = buffer.get();
              value |= (v & 0x7f) << 35;
              if ((v & 0x80) != 0) {
                v = buffer.get();
                value |= (v & 0x7f) << 42;
                if ((v & 0x80) != 0) {
                  v = buffer.get();
                  value |= (v & 0x7f) << 49;
                  if ((v & 0x80) != 0) {
                    v = buffer.get();
                    value |= v << 56;
                  }
                }
              }
            }
          }
        }
      }
    }
    value = (value >>> 1) ^ -(value & 1);
    return value;
  }
}

export default ZigZagEncoding;
