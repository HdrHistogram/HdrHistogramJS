import ByteBuffer from "./ByteBuffer"
import Int8Histogram from "./Int8Histogram"
import Int16Histogram from "./Int16Histogram"
import Int32Histogram from "./Int32Histogram"
import Float64Histogram from "./Float64Histogram"
import AbstractHistogram from "./AbstractHistogram"

interface BuildRequest {
  /**
   * The size in bit of each count bucket
   * Default value is 32
   */
  bitBucketSize?: 8 | 16 | 32 | 64
  /**
   * Control whether or not the histogram can auto-resize and auto-adjust it's
   * highestTrackableValue
   * Default value is true
   */
  autoResize?: boolean
  /**
   * The lowest value that can be discerned (distinguished from 0) by the histogram.
   * Must be a positive integer that is {@literal >=} 1. May be internally rounded
   * down to nearest power of 2.
   * Default value is 1
   */
  lowestDiscernibleValue?: number 
  /**
   * The highest value to be tracked by the histogram. Must be a positive
   * integer that is {@literal >=} (2 * lowestDiscernibleValue).
   * Default value is Number.MAX_SAFE_INTEGER
   */
  highestTrackableValue?: number
  /**
   * The number of significant decimal digits to which the histogram will
   * maintain value resolution and separation. Must be a non-negative
   * integer between 0 and 5.
   * Default value is 3
   */
  numberOfSignificantValueDigits?: 1 | 2 | 3 | 4 | 5
}

const defaultRequest: BuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1, 
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3
}

const build = (request = defaultRequest) => {
  const parameters = Object.assign({}, defaultRequest, request);
  let histogramConstr: typeof AbstractHistogram;
  switch(parameters.bitBucketSize) {
    case 8: histogramConstr = Int8Histogram; 
      break;
    case 16: histogramConstr = Int16Histogram; 
      break;
    case 32: histogramConstr = Int32Histogram;
      break;
    default: histogramConstr = Float64Histogram; 
  }

  const constructor = histogramConstr as any;
  const histogram: AbstractHistogram 
    = new constructor(
      parameters.lowestDiscernibleValue, 
      parameters.highestTrackableValue,
      parameters.numberOfSignificantValueDigits
    );
  histogram.autoResize = parameters.autoResize as boolean;
  return histogram;
}

export { 
  Int8Histogram,
  Int16Histogram,
  Int32Histogram,
  Float64Histogram,
  AbstractHistogram as Histogram,
  build,
  BuildRequest,
  ByteBuffer
}