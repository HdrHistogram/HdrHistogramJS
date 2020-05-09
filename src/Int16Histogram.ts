/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./AbstractHistogram";

class Int16Histogram extends AbstractHistogram {
  _counts: Uint16Array;
  _totalCount: number;

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
    this._totalCount = 0;
    this._counts = new Uint16Array(this.countsArrayLength);
  }

  clearCounts() {
    this._counts.fill(0);
  }

  incrementCountAtIndex(index: number) {
    const currentCount = this._counts[index];
    const newCount = currentCount + 1;
    if (newCount < 0) {
      throw newCount + " would overflow short integer count";
    }
    this._counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const currentCount = this._counts[index];
    const newCount = currentCount + value;
    if (
      newCount < Number.MIN_SAFE_INTEGER ||
      newCount > Number.MAX_SAFE_INTEGER
    ) {
      throw newCount + " would overflow integer count";
    }
    this._counts[index] = newCount;
  }

  setCountAtIndex(index: number, value: number) {
    if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
      throw value + " would overflow integer count";
    }
    this._counts[index] = value;
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new Uint16Array(this.countsArrayLength);
    newCounts.set(this._counts);
    this._counts = newCounts;
  }

  incrementTotalCount() {
    this._totalCount++;
  }

  addToTotalCount(value: number) {
    this._totalCount += value;
  }

  setTotalCount(value: number) {
    this._totalCount = value;
  }

  getTotalCount() {
    return this._totalCount;
  }

  getCountAtIndex(index: number) {
    return this._counts[index];
  }

  protected _getEstimatedFootprintInBytes() {
    return 512 + 2 * this._counts.length;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    const copy = new Int16Histogram(
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

export default Int16Histogram;
