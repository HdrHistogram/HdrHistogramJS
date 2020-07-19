/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import RecordedValuesIterator from "./RecordedValuesIterator";
import PercentileIterator from "./PercentileIterator";

export const NO_TAG = "NO TAG";

export abstract class AbstractHistogramBase<T, U> {
  static identityBuilder: number;

  identity: f64;
  autoResize: boolean = false;

  highestTrackableValue: u64;
  lowestDiscernibleValue: u64;
  numberOfSignificantValueDigits: u8;

  bucketCount: u64;
  /**
   * Power-of-two length of linearly scaled array slots in the counts array. Long enough to hold the first sequence of
   * entries that must be distinguished by a single unit (determined by configured precision).
   */
  subBucketCount: i32;
  countsArrayLength: i32;
  wordSizeInBytes: u64;

  startTimeStampMsec: u64 = u64.MAX_VALUE;
  endTimeStampMsec: u64 = 0;
  tag: string = NO_TAG;

  integerToDoubleValueConversionRatio: f64 = 1.0;

  percentileIterator: PercentileIterator<T, U>;
  recordedValuesIterator: RecordedValuesIterator<T, U>;

  constructor() {
    this.identity = 0;
    this.highestTrackableValue = 0;
    this.lowestDiscernibleValue = 0;
    this.numberOfSignificantValueDigits = 0;
    this.bucketCount = 0;
    this.subBucketCount = 0;
    this.countsArrayLength = 0;
    this.wordSizeInBytes = 0;
  }
}
