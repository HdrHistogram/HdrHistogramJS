/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import ByteBuffer from "./ByteBuffer";
import { AbstractHistogram, HistogramConstructor } from "./AbstractHistogram";
import Int32Histogram from "./Int32Histogram";
import "./AbstractHistogram.encoding";

const base64 = require("base64-js");

const decodeFromCompressedBase64 = (
  base64String: string,
  histogramConstr: HistogramConstructor = Int32Histogram,
  minBarForHighestTrackableValue: number = 0
): AbstractHistogram => {
  const buffer = new ByteBuffer(base64.toByteArray(base64String));
  return AbstractHistogram.decodeFromCompressedByteBuffer(
    buffer,
    histogramConstr,
    minBarForHighestTrackableValue
  );
};

const encodeIntoBase64String = (
  histogram: AbstractHistogram,
  compressionLevel?: number
): string => {
  const buffer = ByteBuffer.allocate();
  const bufferSize = histogram.encodeIntoCompressedByteBuffer(
    buffer,
    compressionLevel
  );

  const encodedBuffer = buffer.data.slice(0, bufferSize);
  return base64.fromByteArray(encodedBuffer);
};

export { decodeFromCompressedBase64, encodeIntoBase64String };
