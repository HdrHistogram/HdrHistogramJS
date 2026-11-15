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
  // Counts are range-checked against the storage width: unsigned typed arrays
  // would otherwise wrap silently (255 + 1 -> 0 in an 8-bit array).
  // Float64 storage keeps the safe-integer range it always had.
  private readonly countBits: number;
  private readonly countMin: number;
  private readonly countMax: number;

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
    this.countBits = this._counts.BYTES_PER_ELEMENT * 8;
    if (this.countBits < 64) {
      this.countMin = 0;
      this.countMax = Math.pow(2, this.countBits) - 1;
    } else {
      this.countMin = Number.MIN_SAFE_INTEGER;
      this.countMax = Number.MAX_SAFE_INTEGER;
    }
  }

  clearCounts() {
    this._counts.fill(0);
  }

  /** @internal */
  nextNonZeroIndex(fromIndex: number) {
    const counts = this._counts;
    const length = this.countsArrayLength;
    for (let i = fromIndex; i < length; i++) {
      if (counts[i] !== 0) {
        return i;
      }
    }
    return -1;
  }

  incrementCountAtIndex(index: number) {
    const newCount = this._counts[index] + 1;
    if (newCount > this.countMax) {
      this.throwCountOverflow(newCount);
    }
    this._counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const newCount = this._counts[index] + value;
    if (newCount > this.countMax) {
      this.throwCountOverflow(newCount);
    }
    if (newCount < this.countMin) {
      this.throwCountUnderflow(newCount);
    }
    this._counts[index] = newCount;
  }

  setCountAtIndex(index: number, value: number) {
    if (value > this.countMax) {
      this.throwCountOverflow(value);
    }
    if (value < this.countMin) {
      this.throwCountUnderflow(value);
    }
    this._counts[index] = value;
  }

  private throwCountOverflow(count: number): never {
    throw new Error(`${count} would overflow ${this.countWidthLabel()} count`);
  }

  private throwCountUnderflow(count: number): never {
    throw new Error(`${count} would underflow ${this.countWidthLabel()} count`);
  }

  private countWidthLabel() {
    return this.countBits < 64 ? `${this.countBits}-bit integer` : "integer";
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
