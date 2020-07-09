/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
// @ts-ignore
import * as base64 from "base64-js";
// @ts-ignore
import * as pako from "pako";
import { JsHistogram } from "./JsHistogram";
import ByteBuffer from "./ByteBuffer";
import { BitBucketSize } from "./Histogram";
import { constructorFromBucketSize } from "./JsHistogramFactory";
import ZigZagEncoding from "./ZigZagEncoding";

const { max } = Math;

const V2EncodingCookieBase = 0x1c849303;
const V2CompressedEncodingCookieBase = 0x1c849304;
const V2maxWordSizeInBytes = 9; // LEB128-64b9B + ZigZag require up to 9 bytes per word
const encodingCookie = V2EncodingCookieBase | 0x10; // LSBit of wordsize byte indicates TLZE Encoding
const compressedEncodingCookie = V2CompressedEncodingCookieBase | 0x10; // LSBit of wordsize byte indicates TLZE Encoding

function fillBufferFromCountsArray(self: JsHistogram, buffer: ByteBuffer) {
  const countsLimit = self.countsArrayIndex(self.maxValue) + 1;
  let srcIndex = 0;

  while (srcIndex < countsLimit) {
    // V2 encoding format uses a ZigZag LEB128-64b9B encoded long. Positive values are counts,
    // while negative values indicate a repeat zero counts.
    const count = self.getCountAtIndex(srcIndex++);
    if (count < 0) {
      throw new Error(
        "Cannot encode histogram containing negative counts (" +
          count +
          ") at index " +
          srcIndex +
          ", corresponding the value range [" +
          self.lowestEquivalentValue(self.valueFromIndex(srcIndex)) +
          "," +
          self.nextNonEquivalentValue(self.valueFromIndex(srcIndex)) +
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
 * @param self this histogram
 * @param buffer The buffer to encode into
 * @return The number of bytes written to the buffer
 */
function encodeIntoByteBuffer(self: JsHistogram, buffer: ByteBuffer) {
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

function fillCountsArrayFromSourceBuffer(
  self: JsHistogram,
  sourceBuffer: ByteBuffer,
  lengthInBytes: number,
  wordSizeInBytes: number
) {
  if (
    wordSizeInBytes != 2 &&
    wordSizeInBytes != 4 &&
    wordSizeInBytes != 8 &&
    wordSizeInBytes != V2maxWordSizeInBytes
  ) {
    throw new Error(
      "word size must be 2, 4, 8, or V2maxWordSizeInBytes (" +
        V2maxWordSizeInBytes +
        ") bytes"
    );
  }
  let dstIndex = 0;
  const endPosition = sourceBuffer.position + lengthInBytes;
  while (sourceBuffer.position < endPosition) {
    let zerosCount = 0;
    let count = ZigZagEncoding.decode(sourceBuffer);
    if (count < 0) {
      zerosCount = -count;
      dstIndex += zerosCount; // No need to set zeros in array. Just skip them.
    } else {
      self.setCountAtIndex(dstIndex++, count);
    }
  }
  return dstIndex; // this is the destination length
}

function getCookieBase(cookie: number): number {
  return cookie & ~0xf0;
}

function getWordSizeInBytesFromCookie(cookie: number): number {
  if (
    getCookieBase(cookie) == V2EncodingCookieBase ||
    getCookieBase(cookie) == V2CompressedEncodingCookieBase
  ) {
    return V2maxWordSizeInBytes;
  }
  const sizeByte = (cookie & 0xf0) >> 4;
  return sizeByte & 0xe;
}

function findDeflateFunction() {
  try {
    return eval('require("zlib").deflateSync');
  } catch (error) {
    return !!pako ? pako.deflate : () => { throw new Error('pako library is mandatory for encoding/deconding on the browser side') };
  }
}
function findInflateFunction() {
  try {
    return eval('require("zlib").inflateSync');
  } catch (error) {
    return !!pako ? pako.inflate : () => { throw new Error('pako library is mandatory for encoding/deconding on the browser side') };
  }
}

export const deflate = findDeflateFunction();
export const inflate = findInflateFunction();

export function decompress(data: Uint8Array): Uint8Array {
  const buffer = new ByteBuffer(data);
  const initialTargetPosition = buffer.position;

  const cookie = buffer.getInt32();

  if ((cookie & ~0xf0) !== V2CompressedEncodingCookieBase) {
    throw new Error("Encoding not supported, only V2 is supported");
  }

  const lengthOfCompressedContents = buffer.getInt32();

  const uncompressedBuffer: Uint8Array = inflate(
    buffer.data.slice(
      initialTargetPosition + 8,
      initialTargetPosition + 8 + lengthOfCompressedContents
    )
  );
  return uncompressedBuffer;
}

export function doDecode(
  data: Uint8Array,
  bitBucketSize: BitBucketSize = 32,
  minBarForHighestTrackableValue: number = 0
) {
  const buffer = new ByteBuffer(data);
  const cookie = buffer.getInt32();

  let payloadLengthInBytes: number;
  let numberOfSignificantValueDigits: number;
  let lowestTrackableUnitValue: number;
  let highestTrackableValue: number;

  if (getCookieBase(cookie) === V2EncodingCookieBase) {
    if (getWordSizeInBytesFromCookie(cookie) != V2maxWordSizeInBytes) {
      throw new Error(
        "The buffer does not contain a Histogram (no valid cookie found)"
      );
    }
    payloadLengthInBytes = buffer.getInt32();
    buffer.getInt32(); // normalizingIndexOffset not used
    numberOfSignificantValueDigits = buffer.getInt32();
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

  const histogramConstr = constructorFromBucketSize(bitBucketSize);

  const histogram = new histogramConstr(
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

function doEncodeIntoCompressedBase64(compressionLevel?: number): string {
  const compressionOptions = compressionLevel
    ? { level: compressionLevel }
    : {};
  const self: JsHistogram = this as any;

  const targetBuffer = ByteBuffer.allocate();
  targetBuffer.putInt32(compressedEncodingCookie);

  const intermediateUncompressedByteBuffer = ByteBuffer.allocate();
  const uncompressedLength = encodeIntoByteBuffer(
    self,
    intermediateUncompressedByteBuffer
  );
  const data = intermediateUncompressedByteBuffer.data.slice(
    0,
    uncompressedLength
  );
  const compressedData: Uint8Array = deflate(data, compressionOptions);
  targetBuffer.putInt32(compressedData.byteLength);
  targetBuffer.putArray(compressedData);

  return base64.fromByteArray(targetBuffer.data);
}

declare module "./JsHistogram" {
  namespace JsHistogram {
    export let decode: typeof doDecode;
  }
}

JsHistogram.decode = doDecode;

declare module "./JsHistogram" {
  interface JsHistogram {
    encodeIntoCompressedBase64: typeof doEncodeIntoCompressedBase64;
  }
}

JsHistogram.prototype.encodeIntoCompressedBase64 = doEncodeIntoCompressedBase64;
