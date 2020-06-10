/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import Histogram from "./Histogram";
import HistogramIterationValue from "./HistogramIterationValue";

/**
 * Used for iterating through histogram values according to percentile levels. The iteration is
 * performed in steps that start at 0% and reduce their distance to 100% according to the
 * <i>percentileTicksPerHalfDistance</i> parameter, ultimately reaching 100% when all recorded histogram
 * values are exhausted.
 */
class PercentileIterator<T, U> {
  percentileTicksPerHalfDistance: i32;
  percentileLevelToIterateTo: f64;
  percentileLevelToIterateFrom: f64;
  reachedLastRecordedValue: boolean;
  histogram: Histogram<T, U>;
  savedHistogramTotalRawCount: u64;
  currentIndex: i32;
  currentValueAtIndex: u64;
  nextValueAtIndex: u64;
  prevValueIteratedTo: u64;
  totalCountToPrevIndex: u64;
  totalCountToCurrentIndex: u64;
  totalValueToCurrentIndex: u64;
  arrayTotalCount: u64;
  countAtThisValue: u64;

  private freshSubBucket: boolean;

  currentIterationValue: HistogramIterationValue = new HistogramIterationValue();

  /**
   * @param histogram The histogram this iterator will operate on
   * @param percentileTicksPerHalfDistance The number of equal-sized iteration steps per half-distance to 100%.
   */
  public constructor(
    histogram: Histogram<T, U>,
    percentileTicksPerHalfDistance: i32
  ) {
    this.percentileTicksPerHalfDistance = 0;
    this.percentileLevelToIterateTo = 0;
    this.percentileLevelToIterateFrom = 0;
    this.reachedLastRecordedValue = false;
    this.doReset(histogram, percentileTicksPerHalfDistance);
  }

  /**
   * Reset iterator for re-use in a fresh iteration over the same histogram data set.
   *
   * @param percentileTicksPerHalfDistance The number of iteration steps per half-distance to 100%.
   */
  reset(percentileTicksPerHalfDistance: i32): void {
    this.doReset(this.histogram, percentileTicksPerHalfDistance);
  }

  private doReset(
    histogram: Histogram<T, U>,
    percentileTicksPerHalfDistance: i32
  ): void {
    this.resetIterator(histogram);
    this.percentileTicksPerHalfDistance = percentileTicksPerHalfDistance;
    this.percentileLevelToIterateTo = 0;
    this.percentileLevelToIterateFrom = 0;
    this.reachedLastRecordedValue = false;
  }

  incrementIterationLevel(): void {
    this.percentileLevelToIterateFrom = this.percentileLevelToIterateTo;

    // The choice to maintain fixed-sized "ticks" in each half-distance to 100% [starting
    // from 0%], as opposed to a "tick" size that varies with each interval, was made to
    // make the steps easily comprehensible and readable to humans. The resulting percentile
    // steps are much easier to browse through in a percentile distribution output, for example.
    //
    // We calculate the number of equal-sized "ticks" that the 0-100 range will be divided
    // by at the current scale. The scale is detemined by the percentile level we are
    // iterating to. The following math determines the tick size for the current scale,
    // and maintain a fixed tick size for the remaining "half the distance to 100%"
    // [from either 0% or from the previous half-distance]. When that half-distance is
    // crossed, the scale changes and the tick size is effectively cut in half.

    // percentileTicksPerHalfDistance = 5
    // percentileReportingTicks = 10,

    const percentileReportingTicks =
      <f64>this.percentileTicksPerHalfDistance *
      Math.pow(
        2,
        floor(
          Math.log2(<f64>100 / (<f64>100 - this.percentileLevelToIterateTo))
        ) + <f64>1
      );

    this.percentileLevelToIterateTo += <f64>100 / percentileReportingTicks;
  }

  reachedIterationLevel(): boolean {
    if (this.countAtThisValue === 0) {
      return false;
    }
    const currentPercentile =
      (<f64>100 * <f64>this.totalCountToCurrentIndex) /
      <f64>this.arrayTotalCount;
    return currentPercentile >= this.percentileLevelToIterateTo;
  }

  resetIterator(histogram: Histogram<T, U>): void {
    this.histogram = histogram;
    this.savedHistogramTotalRawCount = histogram.totalCount;
    this.arrayTotalCount = histogram.totalCount;
    this.currentIndex = 0;
    this.currentValueAtIndex = 0;
    this.nextValueAtIndex = 1 << histogram.unitMagnitude;
    this.prevValueIteratedTo = 0;
    this.totalCountToPrevIndex = 0;
    this.totalCountToCurrentIndex = 0;
    this.totalValueToCurrentIndex = 0;
    this.countAtThisValue = 0;
    this.freshSubBucket = true;
    this.currentIterationValue.reset();
  }

  /**
   * Returns true if the iteration has more elements. (In other words, returns true if next would return an
   * element rather than throwing an exception.)
   *
   * @return true if the iterator has more elements.
   */
  public hasNext(): boolean {
    if (this.histogram.totalCount !== this.savedHistogramTotalRawCount) {
      throw "Concurrent Modification Exception";
    }
    if (this.totalCountToCurrentIndex < this.arrayTotalCount) {
      return true;
    }
    if (!this.reachedLastRecordedValue && this.arrayTotalCount > 0) {
      this.percentileLevelToIterateTo = 100;
      this.reachedLastRecordedValue = true;
      return true;
    }
    return false;
  }

  /**
   * Returns the next element in the iteration.
   *
   * @return the {@link HistogramIterationValue} associated with the next element in the iteration.
   */
  public next(): HistogramIterationValue {
    // Move through the sub buckets and buckets until we hit the next reporting level:
    while (!this.exhaustedSubBuckets()) {
      this.countAtThisValue = this.histogram.getCountAtIndex(this.currentIndex);
      if (this.freshSubBucket) {
        // Don't add unless we've incremented since last bucket...
        this.totalCountToCurrentIndex += this.countAtThisValue;
        this.totalValueToCurrentIndex +=
          this.countAtThisValue *
          this.histogram.highestEquivalentValue(this.currentValueAtIndex);
        this.freshSubBucket = false;
      }
      if (this.reachedIterationLevel()) {
        const valueIteratedTo = this.getValueIteratedTo();

        //Object.assign(this.currentIterationValue, {
        this.currentIterationValue.valueIteratedTo = valueIteratedTo;
        this.currentIterationValue.valueIteratedFrom = this.prevValueIteratedTo;
        this.currentIterationValue.countAtValueIteratedTo = this.countAtThisValue;
        this.currentIterationValue.countAddedInThisIterationStep =
          this.totalCountToCurrentIndex - this.totalCountToPrevIndex;
        this.currentIterationValue.totalCountToThisValue = this.totalCountToCurrentIndex;
        this.currentIterationValue.totalValueToThisValue = this.totalValueToCurrentIndex;
        this.currentIterationValue.percentile =
          (<f64>100 * <f64>this.totalCountToCurrentIndex) /
          <f64>this.arrayTotalCount;
        this.currentIterationValue.percentileLevelIteratedTo = this.getPercentileIteratedTo();
        this.prevValueIteratedTo = valueIteratedTo;
        this.totalCountToPrevIndex = this.totalCountToCurrentIndex;
        this.incrementIterationLevel();
        if (this.histogram.totalCount !== this.savedHistogramTotalRawCount) {
          throw new Error("Concurrent Modification Exception");
        }
        return this.currentIterationValue;
      }
      this.incrementSubBucket();
    }
    throw new Error("Index Out Of Bounds Exception");
  }

  getPercentileIteratedTo(): f64 {
    return this.percentileLevelToIterateTo;
  }

  getPercentileIteratedFrom(): f64 {
    return this.percentileLevelToIterateFrom;
  }

  getValueIteratedTo(): u64 {
    return this.histogram.highestEquivalentValue(this.currentValueAtIndex);
  }

  private exhaustedSubBuckets(): boolean {
    return this.currentIndex >= this.histogram.countsArrayLength;
  }

  incrementSubBucket(): void {
    this.freshSubBucket = true;
    this.currentIndex++;
    this.currentValueAtIndex = this.histogram.valueFromIndex(this.currentIndex);
    this.nextValueAtIndex = this.histogram.valueFromIndex(
      this.currentIndex + 1
    );
  }
}

export default PercentileIterator;
