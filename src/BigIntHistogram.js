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
    this.totalCount = 0;  
    this.counts = new BigUint64Array(this.countsArrayLength);
  }

  clearCounts() {
    this.counts.fill(0n);
  }

  incrementCountAtIndex(index) {
    const currentCount = this.counts[index];
    const newCount = currentCount + 1n;
    if (newCount < 0) {
      throw newCount + " would overflow short integer count";
    }
    this.counts[index] = newCount;
  }

  addToCountAtIndex(index, value) {
    const currentCount = this.counts[index];
    const newCount = currentCount + BigInt(value);
    this.counts[index] = newCount;
  }

  setCountAtIndex(index, value) {
    this.counts[index] = BigInt(value);
  }

  resize(newHighestTrackableValue) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new BigUint64Array(this.countsArrayLength);
    newCounts.set(this.counts);
    this.counts = newCounts;
  }

  setNormalizingIndexOffset(normalizingIndexOffset) {}

  incrementTotalCount() {
    this.totalCount++;
  }

  addToTotalCount(value) {
    this.totalCount += value;
  }

  setTotalCount(value) {
    this.totalCount = value;
  }

  getTotalCount() {
    return this.totalCount;
  }

  getCountAtIndex(index) {
    return Number(this.counts[index]);
  }

  _getEstimatedFootprintInBytes() {
    return 512 + 8 * this.counts.length;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples
  ) {
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