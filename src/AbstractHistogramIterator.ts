/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./AbstractHistogram";
import HistogramIterationValue from "./HistogramIterationValue";

/**
 * Used for iterating through histogram values.
 */
abstract class AbstractHistogramIterator /* implements Iterator<HistogramIterationValue> */ {
  histogram: AbstractHistogram;
  savedHistogramTotalRawCount: number;
  currentIndex: number;
  currentValueAtIndex: number;
  nextValueAtIndex: number;
  prevValueIteratedTo: number;
  totalCountToPrevIndex: number;
  totalCountToCurrentIndex: number;
  totalValueToCurrentIndex: number;
  arrayTotalCount: number;
  countAtThisValue: number;

  private freshSubBucket: boolean;

  currentIterationValue: HistogramIterationValue = new HistogramIterationValue();

  resetIterator(histogram: AbstractHistogram) {
    this.histogram = histogram;
    this.savedHistogramTotalRawCount = histogram.getTotalCount();
    this.arrayTotalCount = histogram.getTotalCount();
    this.currentIndex = 0;
    this.currentValueAtIndex = 0;
    this.nextValueAtIndex = Math.pow(2, histogram.unitMagnitude);
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
    if (this.histogram.getTotalCount() !== this.savedHistogramTotalRawCount) {
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

        Object.assign(this.currentIterationValue, {
          valueIteratedTo,
          valueIteratedFrom: this.prevValueIteratedTo,
          countAtValueIteratedTo: this.countAtThisValue,
          countAddedInThisIterationStep:
            this.totalCountToCurrentIndex - this.totalCountToPrevIndex,
          totalCountToThisValue: this.totalCountToCurrentIndex,
          totalValueToThisValue: this.totalValueToCurrentIndex,
          percentile:
            100 * this.totalCountToCurrentIndex / this.arrayTotalCount,
          percentileLevelIteratedTo: this.getPercentileIteratedTo()
        });

        this.prevValueIteratedTo = valueIteratedTo;
        this.totalCountToPrevIndex = this.totalCountToCurrentIndex;
        this.incrementIterationLevel();
        if (
          this.histogram.getTotalCount() !== this.savedHistogramTotalRawCount
        ) {
          throw new Error("Concurrent Modification Exception");
        }
        return this.currentIterationValue;
      }
      this.incrementSubBucket();
    }
    throw new Error("Index Out Of Bounds Exception");
  }

  abstract incrementIterationLevel(): void;

  /**
   * @return true if the current position's data should be emitted by the iterator
   */
  abstract reachedIterationLevel(): boolean;

  getPercentileIteratedTo(): number {
    return 100 * this.totalCountToCurrentIndex / this.arrayTotalCount;
  }

  getPercentileIteratedFrom(): number {
    return 100 * this.totalCountToPrevIndex / this.arrayTotalCount;
  }

  getValueIteratedTo(): number {
    return this.histogram.highestEquivalentValue(this.currentValueAtIndex);
  }

  private exhaustedSubBuckets(): boolean {
    return this.currentIndex >= this.histogram.countsArrayLength;
  }

  incrementSubBucket() {
    this.freshSubBucket = true;
    this.currentIndex++;
    this.currentValueAtIndex = this.histogram.valueFromIndex(this.currentIndex);
    this.nextValueAtIndex = this.histogram.valueFromIndex(
      this.currentIndex + 1
    );
  }
}

export default AbstractHistogramIterator;
