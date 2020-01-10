/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./AbstractHistogram";
import { PackedArray } from "./packedarray/PackedArray";
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
class PackedHistogram extends AbstractHistogram {
  packedCounts: PackedArray;
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
    this.packedCounts = new PackedArray(this.countsArrayLength);
  }

  clearCounts() {
    this.packedCounts.clear();
    this.totalCount = 0;
  }

  incrementCountAtIndex(index: number) {
    this.packedCounts.increment(index);
  }

  addToCountAtIndex(index: number, value: number) {
    this.packedCounts.add(index, value);
  }

  setCountAtIndex(index: number, value: number) {
    /* TODO move in packed array
    if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) {
      throw value + " would overflow integer count";
    }*/
    this.packedCounts.set(index, value);
  }

  resize(newHighestTrackableValue: number) {
    this.establishSize(newHighestTrackableValue);
    this.packedCounts.setVirtualLength(this.countsArrayLength);
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
    return this.packedCounts.get(index);
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
}

export default PackedHistogram;
