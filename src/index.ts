/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import ByteBuffer from "./ByteBuffer";
import Int8Histogram from "./Int8Histogram";
import Int16Histogram from "./Int16Histogram";
import Int32Histogram from "./Int32Histogram";
import Float64Histogram from "./Float64Histogram";
import AbstractHistogram, { HistogramConstructor } from "./AbstractHistogram";
import HistogramLogReader, { listTags } from "./HistogramLogReader";
import HistogramLogWriter from "./HistogramLogWriter";
import { decodeFromCompressedBase64, encodeIntoBase64String } from "./encoding";
import Recorder from "./Recorder";

declare function require(name: string): any;

interface BuildRequest {
  /**
   * The size in bit of each count bucket
   * Default value is 32
   */
  bitBucketSize?: 8 | 16 | 32 | 64;
  /**
   * Control whether or not the histogram can auto-resize and auto-adjust it's
   * highestTrackableValue
   * Default value is true
   */
  autoResize?: boolean;
  /**
   * The lowest value that can be discerned (distinguished from 0) by the histogram.
   * Must be a positive integer that is {@literal >=} 1. May be internally rounded
   * down to nearest power of 2.
   * Default value is 1
   */
  lowestDiscernibleValue?: number;
  /**
   * The highest value to be tracked by the histogram. Must be a positive
   * integer that is {@literal >=} (2 * lowestDiscernibleValue).
   * Default value is Number.MAX_SAFE_INTEGER
   */
  highestTrackableValue?: number;
  /**
   * The number of significant decimal digits to which the histogram will
   * maintain value resolution and separation. Must be a non-negative
   * integer between 0 and 5.
   * Default value is 3
   */
  numberOfSignificantValueDigits?: 1 | 2 | 3 | 4 | 5;
}

const defaultRequest: BuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1,
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3
};

const build = (request = defaultRequest) => {
  const parameters = Object.assign({}, defaultRequest, request);
  let histogramConstr: HistogramConstructor;
  switch (parameters.bitBucketSize) {
    case 8:
      histogramConstr = Int8Histogram;
      break;
    case 16:
      histogramConstr = Int16Histogram;
      break;
    case 32:
      histogramConstr = Int32Histogram;
      break;
    default:
      histogramConstr = Float64Histogram;
  }

  const histogram: AbstractHistogram = new histogramConstr(
    parameters.lowestDiscernibleValue as number,
    parameters.highestTrackableValue as number,
    parameters.numberOfSignificantValueDigits as number
  );
  histogram.autoResize = parameters.autoResize as boolean;
  return histogram;
};

export {
  Int8Histogram,
  Int16Histogram,
  Int32Histogram,
  Float64Histogram,
  AbstractHistogram,
  AbstractHistogram as Histogram,
  HistogramLogReader,
  listTags,
  BuildRequest,
  defaultRequest,
  build,
  ByteBuffer,
  decodeFromCompressedBase64,
  encodeIntoBase64String,
  HistogramLogWriter,
  Recorder
};
