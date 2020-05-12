/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import "./AbstractHistogram.encoding";
import { AbstractHistogram } from "./AbstractHistogram";
import ByteBuffer from "./ByteBuffer";
import Histogram from "./Histogram";
import { WasmHistogram } from "./wasm";

// @ts-ignore
import * as base64 from "base64-js";
// @ts-ignore
import * as pako from "pako";

const V2CompressedEncodingCookieBase = 0x1c849304;

function findDeflateFunction() {
  try {
    return eval('require("zlib").deflateSync');
  } catch (error) {
    return pako.deflate;
  }
}
function findInflateFunction() {
  try {
    return eval('require("zlib").inflateSync');
  } catch (error) {
    return pako.inflate;
  }
}

const deflate = findDeflateFunction();
const inflate = findInflateFunction();

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

export const decodeFromCompressedBase64 = (
  base64String: string,
  bitBucketSize: 8 | 16 | 32 | 64 | "packed" = 32,
  useWebAssembly: boolean = false,
  minBarForHighestTrackableValue: number = 0
): Histogram => {
  const data = base64.toByteArray(base64String.trim());
  const uncompressedData = decompress(data);
  if (useWebAssembly) {
    return WasmHistogram.decode(
      uncompressedData,
      bitBucketSize,
      minBarForHighestTrackableValue
    );
  }
  return AbstractHistogram.decode(
    uncompressedData,
    bitBucketSize,
    minBarForHighestTrackableValue
  );
};

function encodeWasmIntoCompressedBase64(compressionLevel?: number): string {
  const compressionOptions = compressionLevel
    ? { level: compressionLevel }
    : {};
  const self: WasmHistogram = this as any;
  const data = self.encode();
  const compressedData: Uint8Array = deflate(data, compressionOptions);
  return base64.fromByteArray(compressedData);
}

declare module "./wasm" {
  interface WasmHistogram {
    encodeIntoCompressedBase64: typeof encodeWasmIntoCompressedBase64;
  }
}

WasmHistogram.prototype.encodeIntoCompressedBase64 = encodeWasmIntoCompressedBase64;

export const encodeIntoCompressedBase64 = (
  histogram: Histogram,
  compressionLevel?: number
): string => {
  if (histogram instanceof WasmHistogram) {
    return histogram.encodeIntoCompressedBase64(compressionLevel);
  }
  if (histogram instanceof AbstractHistogram) {
    return histogram.encodeIntoCompressedBase64(compressionLevel);
  }
  throw new Error("Unsupported Histogram implementation");
};
