/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import JsHistogram from "./JsHistogram";
import { PackedArray } from "./packedarray/PackedArray";
import ulp from "./ulp";

const { ceil, max, min } = Math;
/**
 * <h3>A High Dynamic Range (HDR) Histogram that uses a packed internal representation</h3>
 * <p>
 * {@link PackedHistogram} supports the recording and analyzing sampled data value counts across a configurable
 * integer value range with configurable value precision within the range. Value precision is expressed as the
 * number of significant digits in the value recording, and provides control over value quantization behavior
 * across the value range and the subsequent value resolution at any given level.
 * <p>
 * {@link PackedHistogram} tracks value counts in a packed internal representation optimized
 * for typical histogram recoded values are sparse in the value range and tend to be incremented in small unit counts.
 * This packed representation tends to require significantly smaller amounts of stoarge when compared to unpacked
 * representations, but can incur additional recording cost due to resizing and repacking operations that may
 * occur as previously unrecorded values are encountered.
 * <p>
 * For example, a {@link PackedHistogram} could be configured to track the counts of observed integer values between 0 and
 * 3,600,000,000,000 while maintaining a value precision of 3 significant digits across that range. Value quantization
 * within the range will thus be no larger than 1/1,000th (or 0.1%) of any value. This example Histogram could
 * be used to track and analyze the counts of observed response times ranging between 1 nanosecond and 1 hour
 * in magnitude, while maintaining a value resolution of 1 microsecond up to 1 millisecond, a resolution of
 * 1 millisecond (or better) up to one second, and a resolution of 1 second (or better) up to 1,000 seconds. At its
 * maximum tracked value (1 hour), it would still maintain a resolution of 3.6 seconds (or better).
 * <p>
 * Auto-resizing: When constructed with no specified value range range (or when auto-resize is turned on with {@link
 * Histogram#setAutoResize}) a {@link PackedHistogram} will auto-resize its dynamic range to include recorded values as
 * they are encountered. Note that recording calls that cause auto-resizing may take longer to execute, as resizing
 * incurs allocation and copying of internal data structures.
 * <p>
 */
class PackedHistogram extends JsHistogram {
  packedCounts: PackedArray;

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
    this.packedCounts = new PackedArray(this.countsArrayLength);
  }

  clearCounts() {
    this.packedCounts.clear();
  }

  incrementCountAtIndex(index: number) {
    this.packedCounts.increment(index);
  }

  addToCountAtIndex(index: number, value: number) {
    this.packedCounts.add(index, value);
  }

  setCountAtIndex(index: number, value: number) {
    this.packedCounts.set(index, value);
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    this.packedCounts.setVirtualLength(this.countsArrayLength);
  }

  getCountAtIndex(index: number) {
    return this.packedCounts.get(index);
  }

  /** @internal */
  nextNonZeroIndex(fromIndex: number) {
    return this.packedCounts.nextNonZeroIndex(fromIndex);
  }

  /**
   * Same contract as {@link JsHistogram#getValueAtPercentile}, accumulating
   * only the populated indexes of the packed counts instead of scanning the
   * whole counts array.
   */
  getValueAtPercentile(percentile: number) {
    const requestedPercentile = min(percentile, 100); // Truncate down to 100%

    // round count up to nearest integer, to ensure that the largest value that the requested percentile
    // of overall recorded values is actually included. However, this must be done with care:
    //
    // First, Compute fp value for count at the requested percentile. Note that fp result end up
    // being 1 ulp larger than the correct integer count for this percentile:
    const fpCountAtPercentile = (requestedPercentile / 100.0) * this.totalCount;
    // Next, round up, but make sure to prevent <= 1 ulp inaccurancies in the above fp math from
    // making us skip a count:
    const countAtPercentile = max(
      ceil(fpCountAtPercentile - ulp(fpCountAtPercentile)), // round up
      1 // Make sure we at least reach the first recorded entry
    );

    let totalToCurrentIndex = 0;
    for (
      let i = this.nextNonZeroIndex(0);
      i >= 0;
      i = this.nextNonZeroIndex(i + 1)
    ) {
      totalToCurrentIndex += this.getCountAtIndex(i);
      if (totalToCurrentIndex >= countAtPercentile) {
        const valueAtIndex = this.valueFromIndex(i);
        return percentile === 0.0
          ? this.lowestEquivalentValue(valueAtIndex)
          : this.highestEquivalentValue(valueAtIndex);
      }
    }
    return 0;
  }

  protected _getEstimatedFootprintInBytes() {
    return 192 + 8 * this.packedCounts.getPhysicalLength();
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ) {
    const copy = new PackedHistogram(
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
    return `PackedHistogram ${JSON.stringify(this, null, 2)}`;
  }
}

export default PackedHistogram;
