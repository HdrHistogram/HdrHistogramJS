/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import TypedArrayHistogram from "./TypedArrayHistogram";

type CountsArrayCtr = ConstructorParameters<typeof TypedArrayHistogram>[0];

/**
 * Counts widths from narrowest to widest. A histogram starts at the first one
 * and moves to the next one the first time a count does not fit in it.
 */
const TIERS: ReadonlyArray<{
  ctr: CountsArrayCtr;
  bits: number;
  maxCount: number;
}> = [
  { ctr: Uint8Array, bits: 8, maxCount: 0xff },
  { ctr: Uint16Array, bits: 16, maxCount: 0xffff },
  { ctr: Uint32Array, bits: 32, maxCount: 0xffffffff },
  { ctr: Float64Array, bits: 64, maxCount: Number.MAX_SAFE_INTEGER },
];

/**
 * Histogram whose counts start at 8 bits per bucket and are widened (8 -> 16 -> 32 -> 64)
 * by copying the counts into a wider array, once per promotion, when a count would not fit.
 * Every count is checked before it is written, so no count ever wraps.
 *
 * Promotion never changes a count, and never narrows: `clearCounts` keeps the current width.
 * Negative counts throw in every width, so promotion never changes what is accepted.
 */
class AutoCountsHistogram extends TypedArrayHistogram {
  private tier = 0;
  private maxCount = TIERS[0].maxCount;

  constructor(
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number
  ) {
    super(
      TIERS[0].ctr,
      lowestDiscernibleValue,
      highestTrackableValue,
      numberOfSignificantValueDigits
    );
  }

  // The recording hot path: the fit check is inlined here, the rare cases go to the helpers.
  incrementCountAtIndex(index: number) {
    const newCount = this._counts[index] + 1;
    if (newCount > this.maxCount) {
      this.promoteFor(newCount);
    }
    this._counts[index] = newCount;
  }

  addToCountAtIndex(index: number, value: number) {
    const newCount = this._counts[index] + value;
    if (newCount > this.maxCount || newCount < 0) {
      this.checkCount(newCount);
    }
    this._counts[index] = newCount;
  }

  setCountAtIndex(index: number, value: number) {
    this.writeCount(index, value);
  }

  /** Current counts width in bits (8, 16, 32 or 64). */
  get currentBitBucketSize(): number {
    return TIERS[this.tier].bits;
  }

  // A wider count is promoted to, not refused: only counts no width can hold throw here,
  // before an auto-resizing histogram grows.
  protected checkRecordedCount(count: number) {
    if (count < 0) {
      this.throwNegativeCount(count);
    }
    if (count > Number.MAX_SAFE_INTEGER) {
      throw new Error(count + " would overflow integer count");
    }
  }

  private writeCount(index: number, newCount: number) {
    if (newCount > this.maxCount || newCount < 0) {
      this.checkCount(newCount);
    }
    this._counts[index] = newCount;
  }

  private checkCount(newCount: number) {
    if (newCount > this.maxCount) {
      this.promoteFor(newCount);
    } else if (newCount < 0) {
      this.throwNegativeCount(newCount);
    }
  }

  private throwNegativeCount(count: number): never {
    throw new Error(
      count +
        " is a negative count, which the auto counts histogram cannot hold"
    );
  }

  /**
   * Moves the counts to the narrowest width able to hold `count`.
   * The array is copied once, so a single promotion costs one pass over the counts.
   */
  private promoteFor(count: number) {
    if (count > Number.MAX_SAFE_INTEGER) {
      throw new Error(count + " would overflow integer count");
    }
    let target = this.tier;
    while (count > TIERS[target].maxCount) {
      target++;
    }
    const { ctr, maxCount } = TIERS[target];
    const wider = new ctr(this._counts.length);
    wider.set(this._counts);
    this._counts = wider;
    this.arrayCtr = ctr;
    this.tier = target;
    this.maxCount = maxCount;
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    const copy = new AutoCountsHistogram(
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
    return `AutoCountsHistogram ${this.currentBitBucketSize}b ${JSON.stringify(
      this,
      null,
      2
    )}`;
  }
}

export default AutoCountsHistogram;
