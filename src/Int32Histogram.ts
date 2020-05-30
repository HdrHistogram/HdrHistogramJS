/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import TypedArrayHistogram from "./TypedArrayHistogram";

class Int32Histogram extends TypedArrayHistogram {
  constructor(
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number
  ) {
    super(
      Uint32Array,
      lowestDiscernibleValue,
      highestTrackableValue,
      numberOfSignificantValueDigits
    );
  }
}

export default Int32Histogram;
