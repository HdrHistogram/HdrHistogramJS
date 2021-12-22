/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import JsHistogram from "./JsHistogram";

type TypedArray = ArrayLike<number> & {
  readonly BYTES_PER_ELEMENT: number;
  [key: number]: number;
  fill(v: number): void;
  set(other: TypedArray): void;
};

class TypedArrayHistogram extends JsHistogram {
  _counts: TypedArray;
  _totalCount: number;

  maxBucketSize: number;

  constructor(
    private arrayCtr: new (size: number) => TypedArray,
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
    this._counts = new arrayCtr(this.countsArrayLength);
    this.maxBucketSize = 2**(this._counts.BYTES_PER_ELEMENT * 8) - 1;
  }

  clearCounts() {
    this._counts.fill(0);
  }

  incrementCountAtIndex(index: number) {
    const currentCount = this._counts[index];
    const newCount = currentCount + 1;
    if (newCount > this.maxBucketSize) {
      throw newCount + " would overflow " + this._counts.BYTES_PER_ELEMENT * 8 + "bits integer count";
    }
    this._counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const currentCount = this._counts[index];
    const newCount = currentCount + value;
    if (newCount > this.maxBucketSize) {
      throw newCount + " would overflow " + this._counts.BYTES_PER_ELEMENT * 8 + "bits integer count";
    }
    this._counts[index] = newCount;
  }

  setCountAtIndex(index: number, value: number) {
    if (value > this.maxBucketSize) {
      throw value + " would overflow " + this._counts.BYTES_PER_ELEMENT * 8 + "bits integer count";
    }
    this._counts[index] = value;
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    const newCounts = new this.arrayCtr(this.countsArrayLength);
    newCounts.set(this._counts);
    this._counts = newCounts;
  }

  getCountAtIndex(index: number) {
    return this._counts[index];
  }

  protected _getEstimatedFootprintInBytes() {
    return 1024 + this._counts.BYTES_PER_ELEMENT * this._counts.length;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    const copy = new TypedArrayHistogram(
      this.arrayCtr,
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

  toString() {
    return `Histogram ${this._counts.BYTES_PER_ELEMENT * 8}b ${JSON.stringify(
      this,
      null,
      2
    )}`;
  }
}

export default TypedArrayHistogram;
