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
