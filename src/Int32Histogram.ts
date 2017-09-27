/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./AbstractHistogram";

class Int32Histogram extends AbstractHistogram {
  counts: Uint32Array;
  totalCount: number;

  constructor(
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number
  ) {
    super(
      lowestDiscernibleValue,
      highestTrackableValue,
      numberOfSignificantValueDigits
    );
    this.totalCount = 0;
    this.counts = new Uint32Array(this.countsArrayLength);
  }

  clearCounts() {
    this.counts.fill(0);
  }

  incrementCountAtIndex(index: number) {
    const currentCount = this.counts[index];
    const newCount = currentCount + 1;
    if (newCount < 0) {
      throw newCount + " would overflow short integer count";
    }
    this.counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const currentCount = this.counts[index];
    const newCount = currentCount + value;
    if (
      newCount < Number.MIN_SAFE_INTEGER ||
      newCount > Number.MAX_SAFE_INTEGER
    ) {
      throw newCount + " would overflow integer count";
    }
    this.counts[index] = newCount;
  }

  setCountAtIndex(index: number, value: number) {
    if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
      throw value + " would overflow integer count";
    }
    this.counts[index] = value;
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new Uint32Array(this.countsArrayLength);
    newCounts.set(this.counts);
    this.counts = newCounts;
  }

  setNormalizingIndexOffset(normalizingIndexOffset: number) {}

  incrementTotalCount() {
    this.totalCount++;
  }

  addToTotalCount(value: number) {
    this.totalCount += value;
  }

  setTotalCount(value: number) {
    this.totalCount = value;
  }

  getTotalCount() {
    return this.totalCount;
  }

  getCountAtIndex(index: number) {
    return this.counts[index];
  }

  protected _getEstimatedFootprintInBytes() {
    return 512 + 4 * this.counts.length;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    const copy = new Int32Histogram(
      this.lowestDiscernibleValue,
      this.highestTrackableValue,
      this.numberOfSignificantValueDigits
    );
    copy.addWhileCorrectingForCoordinatedOmission(
      this,
      expectedIntervalBetweenValueSamples
    );
    return copy;
  }
}

export default Int32Histogram;
