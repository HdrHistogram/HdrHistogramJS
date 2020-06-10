/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import ByteBuffer from "./ByteBuffer";
import Histogram from "./Histogram";
import ZigZagEncoding from "./ZigZagEncoding";

const V2EncodingCookieBase = 0x1c849303;
const V2CompressedEncodingCookieBase = 0x1c849304;
const V2maxWordSizeInBytes = 9; // LEB128-64b9B + ZigZag require up to 9 bytes per word
const encodingCookie = V2EncodingCookieBase | 0x10; // LSBit of wordsize byte indicates TLZE Encoding
const compressedEncodingCookie = V2CompressedEncodingCookieBase | 0x10; // LSBit of wordsize byte indicates TLZE Encoding

function fillBufferFromCountsArray<T, U>(
  self: Histogram<T, U>,
  buffer: ByteBuffer
): void {
  const countsLimit = self.countsArrayIndex(self.maxValue) + 1;
  let srcIndex = 0;

  while (srcIndex < countsLimit) {
    // V2 encoding format uses a ZigZag LEB128-64b9B encoded long. Positive values are counts,
    // while negative values indicate a repeat zero counts.
    const count = self.getCountAtIndex(srcIndex++);
    if (count < 0) {
      throw new Error(
        "Cannot encode histogram containing negative counts (" +
          count.toString() +
          ") at index " +
          srcIndex.toString() +
          ", corresponding the value range [" +
          self.lowestEquivalentValue(self.valueFromIndex(srcIndex)).toString() +
          "," +
          self
            .nextNonEquivalentValue(self.valueFromIndex(srcIndex))
            .toString() +
          ")"
      );
    }
    // Count trailing 0s (which follow this count):
    let zerosCount = 0;
    if (count == 0) {
      zerosCount = 1;
      while (srcIndex < countsLimit && self.getCountAtIndex(srcIndex) == 0) {
        zerosCount++;
        srcIndex++;
      }
    }
    if (zerosCount > 1) {
      ZigZagEncoding.encode(buffer, -zerosCount);
    } else {
      ZigZagEncoding.encode(buffer, count);
    }
  }
}

/**
 * Encode this histogram into a ByteBuffer
 * @param buffer The buffer to encode into
 * @return The number of bytes written to the buffer
 */
export function encodeIntoByteBuffer<T, U>(
  self: Histogram<T, U>,
  buffer: ByteBuffer
): i32 {
  const initialPosition = buffer.position;
  buffer.putInt32(encodingCookie);
  buffer.putInt32(0); // Placeholder for payload length in bytes.
  buffer.putInt32(1);
  buffer.putInt32(self.numberOfSignificantValueDigits);
  buffer.putInt64(self.lowestDiscernibleValue);
  buffer.putInt64(self.highestTrackableValue);
  buffer.putInt64(1);

  const payloadStartPosition = buffer.position;
  fillBufferFromCountsArray(self, buffer);

  const backupIndex = buffer.position;
  buffer.position = initialPosition + 4;
  buffer.putInt32(backupIndex - payloadStartPosition); // Record the payload length

  buffer.position = backupIndex;

  return backupIndex - initialPosition;
}

function fillCountsArrayFromSourceBuffer<T, U>(
  self: Histogram<T, U>,
  sourceBuffer: ByteBuffer,
  lengthInBytes: u32,
  wordSizeInBytes: u32
): i32 {
  if (
    wordSizeInBytes != 2 &&
    wordSizeInBytes != 4 &&
    wordSizeInBytes != 8 &&
    wordSizeInBytes != V2maxWordSizeInBytes
  ) {
    throw new Error(
      "word size must be 2, 4, 8, or V2maxWordSizeInBytes (" +
        V2maxWordSizeInBytes.toString() +
        ") bytes"
    );
  }
  let dstIndex: i32 = 0;
  const endPosition = sourceBuffer.position + lengthInBytes;
  while (sourceBuffer.position < endPosition) {
    let zerosCount: i32 = 0;
    let count = <i32>ZigZagEncoding.decode(sourceBuffer);
    if (count < 0) {
      zerosCount = -count;
      dstIndex += zerosCount; // No need to set zeros in array. Just skip them.
    } else {
      self.setCountAtIndex(dstIndex++, count);
    }
  }
  return dstIndex; // this is the destination length
}

function getCookieBase(cookie: u32): u32 {
  return cookie & ~0xf0;
}

function getWordSizeInBytesFromCookie(cookie: u32): u32 {
  if (
    getCookieBase(cookie) == V2EncodingCookieBase ||
    getCookieBase(cookie) == V2CompressedEncodingCookieBase
  ) {
    return V2maxWordSizeInBytes;
  }
  const sizeByte = (cookie & 0xf0) >> 4;
  return sizeByte & 0xe;
}

export function decodeFromByteBuffer<T, U>(
  buffer: ByteBuffer,
  minBarForHighestTrackableValue: u64
): Histogram<T, U> {
  const cookie = buffer.getInt32();

  let payloadLengthInBytes: u32;
  let numberOfSignificantValueDigits: u8;
  let lowestTrackableUnitValue: u64;
  let highestTrackableValue: u64;

  if (getCookieBase(cookie) === V2EncodingCookieBase) {
    if (getWordSizeInBytesFromCookie(cookie) != V2maxWordSizeInBytes) {
      throw new Error(
        "The buffer does not contain a Histogram (no valid cookie found)"
      );
    }
    payloadLengthInBytes = buffer.getInt32();
    buffer.getInt32(); // normalizingIndexOffset not used
    numberOfSignificantValueDigits = <u8>buffer.getInt32();
    lowestTrackableUnitValue = buffer.getInt64();
    highestTrackableValue = buffer.getInt64();
    buffer.getInt64(); // integerToDoubleValueConversionRatio not used
  } else {
    throw new Error(
      "The buffer does not contain a Histogram (no valid V2 encoding cookie found)"
    );
  }

  highestTrackableValue = max(
    highestTrackableValue,
    minBarForHighestTrackableValue
  );

  const histogram: Histogram<T, U> = instantiate<Histogram<T, U>>(
    lowestTrackableUnitValue,
    highestTrackableValue,
    numberOfSignificantValueDigits
  );

  const filledLength = fillCountsArrayFromSourceBuffer(
    histogram,
    buffer,
    payloadLengthInBytes,
    V2maxWordSizeInBytes
  );

  histogram.establishInternalTackingValues(filledLength);

  return histogram;
}
