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
 * Used for iterating through all recorded histogram values using the finest granularity steps supported by the
 * underlying representation. The iteration steps through all non-zero recorded value counts, and terminates when
 * all recorded histogram values are exhausted.
 */
class RecordedValuesIterator<T, U> {
  visitedIndex: i32;
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
   */
  constructor(histogram: Histogram<T, U>) {
    this.doReset(histogram);
  }

  /**
   * Reset iterator for re-use in a fresh iteration over the same histogram data set.
   */
  public reset(): void {
    this.doReset(this.histogram);
  }

  private doReset(histogram: Histogram<T, U>): void {
    this.resetIterator(histogram);
    this.visitedIndex = -1;
  }

  incrementIterationLevel(): void {
    this.visitedIndex = this.currentIndex;
  }

  reachedIterationLevel(): bool {
    const currentCount = this.histogram.getCountAtIndex(this.currentIndex);
    return currentCount != 0 && this.visitedIndex !== this.currentIndex;
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
    return this.totalCountToCurrentIndex < this.arrayTotalCount;
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
    return (
      (<f64>100 * <f64>this.totalCountToCurrentIndex) /
      <f64>this.arrayTotalCount
    );
  }

  getPercentileIteratedFrom(): f64 {
    return (
      (<f64>100 * <f64>this.totalCountToPrevIndex) / <f64>this.arrayTotalCount
    );
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

export default RecordedValuesIterator;
