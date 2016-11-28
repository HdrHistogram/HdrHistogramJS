/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import { AbstractHistogram } from "./AbstractHistogram";

class Int16Histogram extends AbstractHistogram {

  counts: Uint16Array
  totalCount: number;

  constructor(
    lowestDiscernibleValue: number, 
    highestTrackableValue: number, 
    numberOfSignificantValueDigits: number) {

    super(
      lowestDiscernibleValue, 
      highestTrackableValue, 
      numberOfSignificantValueDigits
    );
    this.totalCount = 0;
    this.counts = new Uint16Array(this.countsArrayLength);
  }

  incrementCountAtIndex(index: number) {
    const currentCount = this.counts[index];
    const newCount = currentCount + 1;
    if (newCount < 0) {
      throw new Error("would overflow short integer count");
    }
    this.counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const currentCount = this.counts[index];
    const newCount = currentCount + value;
    if ((newCount < Number.MIN_SAFE_INTEGER) || (newCount > Number.MAX_SAFE_INTEGER)) {
      throw "would overflow integer count";
    }
    this.counts[index] = newCount;
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new Uint16Array(this.countsArrayLength);
    newCounts.set(this.counts);
    this.counts = newCounts;
  }

  setNormalizingIndexOffset(normalizingIndexOffset: number) {
  }

  incrementTotalCount() {
    this.totalCount++;
  }

  addToTotalCount(value: number) {
    this.totalCount += value;
  }

  getTotalCount() {
    return this.totalCount;
  }

  getCountAtIndex(index: number)  {
    return this.counts[index];
  }

  protected _getEstimatedFootprintInBytes() {
    return (512 + (2 * this.counts.length));
  }

  copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples: number) {
    const copy 
      = new Int16Histogram(
        this.lowestDiscernibleValue, 
        this.highestTrackableValue, 
        this.numberOfSignificantValueDigits
      );
    copy.addWhileCorrectingForCoordinatedOmission(this, expectedIntervalBetweenValueSamples);
    return copy;
  }
}

export default Int16Histogram; 