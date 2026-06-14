/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
// @ts-ignore
import * as base64 from "base64-js";
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

// The histogram wire format is zlib/DEFLATE, interoperable with the Java/C
// HdrHistogram. The native Compression Streams API exposes that exact format as
// "deflate" (ZLIB Compressed Data Format), works in browsers and Node 18+, and
// requires no third-party dependency. It is async-only, hence the Promise-based
// codec below.
async function pipeThrough(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Observe the writer-side promise so that, on invalid input, its rejection is
  // handled here rather than surfacing as an unhandled rejection. The same error
  // is reported by the read loop below, which is the source of truth for errors.
  const written = writer
    .write(data as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await written;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export const deflate = (data: Uint8Array): Promise<Uint8Array> =>
  pipeThrough(data, new CompressionStream("deflate"));
export const inflate = (data: Uint8Array): Promise<Uint8Array> =>
  pipeThrough(data, new DecompressionStream("deflate"));

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const buffer = new ByteBuffer(data);
  const initialTargetPosition = buffer.position;

  const cookie = buffer.getInt32();

  if ((cookie & ~0xf0) !== V2CompressedEncodingCookieBase) {
    throw new Error("Encoding not supported, only V2 is supported");
  }

  const lengthOfCompressedContents = buffer.getInt32();

  const uncompressedBuffer: Uint8Array = await inflate(
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

// `compressionLevel` is kept for source compatibility but ignored: the native
// Compression Streams API exposes no level option.
async function doEncodeIntoCompressedBase64(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compressionLevel?: number
): Promise<string> {
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
  const compressedData: Uint8Array = await deflate(data);
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
