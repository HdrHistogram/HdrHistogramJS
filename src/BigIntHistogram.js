/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
const AbstractHistogram = require("./AbstractHistogram");

class BigIntHistogram extends AbstractHistogram.default {
  constructor(
    lowestDiscernibleValue,
    highestTrackableValue,
    numberOfSignificantValueDigits
  ) {
    super(
      lowestDiscernibleValue,
      highestTrackableValue,
      numberOfSignificantValueDigits
    );
    this._totalCount = 0;
    this._counts = new BigUint64Array(this.countsArrayLength);
  }

  clearCounts() {
    this._counts.fill(0n);
  }

  incrementCountAtIndex(index) {
    const currentCount = this._counts[index];
    const newCount = currentCount + 1n;
    if (newCount < 0) {
      throw newCount + " would overflow short integer count";
    }
    this._counts[index] = newCount;
  }

  addToCountAtIndex(index, value) {
    const currentCount = this._counts[index];
    const newCount = currentCount + BigInt(value);
    this._counts[index] = newCount;
  }

  setCountAtIndex(index, value) {
    this._counts[index] = BigInt(value);
  }

  resize(newHighestTrackableValue) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new BigUint64Array(this.countsArrayLength);
    newCounts.set(this._counts);
    this._counts = newCounts;
  }

  setNormalizingIndexOffset(normalizingIndexOffset) {}

  incrementTotalCount() {
    this._totalCount++;
  }

  addToTotalCount(value) {
    this._totalCount += value;
  }

  setTotalCount(value) {
    this._totalCount = value;
  }

  getTotalCount() {
    return this._totalCount;
  }

  getCountAtIndex(index) {
    return Number(this._counts[index]);
  }

  _getEstimatedFootprintInBytes() {
    return 512 + 8 * this._counts.length;
  }

  copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) {
    const copy = new BigUint64Array(
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
exports.default = BigIntHistogram;
