import { AbstractHistogramBase } from "./AbstractHistogramBase"
import RecordedValuesIterator from "./RecordedValuesIterator"

const { pow, floor, ceil, round, log2, max, min } = Math;


export abstract class AbstractHistogram extends AbstractHistogramBase {

  // "Hot" accessed fields (used in the the value recording code path) are bunched here, such
  // that they will have a good chance of ending up in the same cache line as the totalCounts and
  // counts array reference fields that subclass implementations will typically add.

  /**
   * Number of leading zeros in the largest value that can fit in bucket 0.
   */
  leadingZeroCountBase: number;
  subBucketHalfCountMagnitude: number;
  /**
   * Largest k such that 2^k &lt;= lowestDiscernibleValue
   */
  unitMagnitude: number;
  subBucketHalfCount: number;

  lowestDiscernibleValueRounded: number;

  /**
   * Biggest value that can fit in bucket 0
   */
  subBucketMask: number;
  /**
   * Lowest unitMagnitude bits are set
   */
  unitMagnitudeMask: number;

  maxValue: number = 0;
  minNonZeroValue: number = Number.MAX_SAFE_INTEGER;

 
  // Sub-classes will typically add a totalCount field and a counts array field, which will likely be laid out
  // right around here due to the subclass layout rules in most practical JVM implementations.

  //
  //
  //
  // Abstract, counts-type dependent methods to be provided by subclass implementations:
  //
  //
  //
  
    abstract getCountAtIndex(index: number): number;
  /*
    abstract getCountAtNormalizedIndex(index: number): number;
  */
  abstract incrementCountAtIndex(index: number): void;
  
  abstract addToCountAtIndex(index: number, value: number): void;
  /*
    abstract setCountAtIndex(index: number, value: number): void;
  
    abstract setCountAtNormalizedIndex(index: number, value: number): void;
  
    abstract getNormalizingIndexOffset(): number;
  */
  abstract setNormalizingIndexOffset(normalizingIndexOffset: number): void;
  /*
    abstract shiftNormalizingIndexByOffset(offsetToAdd: number, lowestHalfBucketPopulated: boolean): void;
  
    abstract setTotalCount(totalCount: number): void;
  */
  abstract incrementTotalCount(): void;
  /*
    abstract addToTotalCount(value: number): void;
  
    abstract clearCounts(): void;
  
    abstract _getEstimatedFootprintInBytes(): number;
  */
    abstract resize(newHighestTrackableValue: number): void;


  /**
   * Get the total count of all recorded values in the histogram
   * @return the total count of all recorded values in the histogram
   */
  abstract getTotalCount(): number;

  private updatedMaxValue(value: number): void {
    const internalValue: number = value + this.unitMagnitudeMask;
    this.maxValue = internalValue;
  }

  private updateMinNonZeroValue(value: number): void {
    if (value <= this.unitMagnitudeMask) {
      return;
    }
    const internalValue = floor(value / this.lowestDiscernibleValueRounded) * this.lowestDiscernibleValueRounded;
    this.minNonZeroValue = internalValue;
  }

  private resetMinNonZeroValue(minNonZeroValue: number) {
    const internalValue = floor(minNonZeroValue / this.lowestDiscernibleValueRounded) * this.lowestDiscernibleValueRounded;
    this.minNonZeroValue = (minNonZeroValue === Number.MAX_SAFE_INTEGER) ? minNonZeroValue : internalValue;
  }

  constructor(lowestDiscernibleValue: number, highestTrackableValue: number, numberOfSignificantValueDigits: number) {
    super();
    // Verify argument validity
    if (lowestDiscernibleValue < 1) {
      throw new Error("lowestDiscernibleValue must be >= 1");
    }
    if (highestTrackableValue < 2 * lowestDiscernibleValue) {
      throw new Error("highestTrackableValue must be >= 2 * lowestDiscernibleValue");
    }
    if ((numberOfSignificantValueDigits < 0) || (numberOfSignificantValueDigits > 5)) {
      throw new Error("numberOfSignificantValueDigits must be between 0 and 5");
    }
    this.identity = AbstractHistogramBase.identityBuilder++;

    this.init(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, 1.0, 0);
  }

  init(lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number,
    integerToDoubleValueConversionRatio: number,
    normalizingIndexOffset: number) {

    this.lowestDiscernibleValue = lowestDiscernibleValue;
    this.highestTrackableValue = highestTrackableValue;
    this.numberOfSignificantValueDigits = numberOfSignificantValueDigits;
    this.integerToDoubleValueConversionRatio = integerToDoubleValueConversionRatio;
    if (normalizingIndexOffset !== 0) {
      this.setNormalizingIndexOffset(normalizingIndexOffset);
    }

    /*
    * Given a 3 decimal point accuracy, the expectation is obviously for "+/- 1 unit at 1000". It also means that
    * it's "ok to be +/- 2 units at 2000". The "tricky" thing is that it is NOT ok to be +/- 2 units at 1999. Only
    * starting at 2000. So internally, we need to maintain single unit resolution to 2x 10^decimalPoints.
    */
    const largestValueWithSingleUnitResolution = 2 * round(pow(10, numberOfSignificantValueDigits));

    this.unitMagnitude = floor(log2(lowestDiscernibleValue));

    this.lowestDiscernibleValueRounded = pow(2, this.unitMagnitude);
    this.unitMagnitudeMask = this.lowestDiscernibleValueRounded - 1;

    // We need to maintain power-of-two subBucketCount (for clean direct indexing) that is large enough to
    // provide unit resolution to at least largestValueWithSingleUnitResolution. So figure out
    // largestValueWithSingleUnitResolution's nearest power-of-two (rounded up), and use that:
    const subBucketCountMagnitude = ceil(log2(largestValueWithSingleUnitResolution));
    this.subBucketHalfCountMagnitude = ((subBucketCountMagnitude > 1) ? subBucketCountMagnitude : 1) - 1;
    this.subBucketCount = pow(2, this.subBucketHalfCountMagnitude + 1);
    this.subBucketHalfCount = this.subBucketCount / 2;
    this.subBucketMask = (round(this.subBucketCount) - 1) * pow(2, this.unitMagnitude);

    this.establishSize(highestTrackableValue);

    this.leadingZeroCountBase = 53 - this.unitMagnitude - this.subBucketHalfCountMagnitude - 1;
    //this.percentileIterator = new PercentileIterator(this, 1);
    this.recordedValuesIterator = new RecordedValuesIterator(this);
  }

  /**
   * The buckets (each of which has subBucketCount sub-buckets, here assumed to be 2048 as an example) overlap:
   *
   * <pre>
   * The 0'th bucket covers from 0...2047 in multiples of 1, using all 2048 sub-buckets
   * The 1'th bucket covers from 2048..4097 in multiples of 2, using only the top 1024 sub-buckets
   * The 2'th bucket covers from 4096..8191 in multiple of 4, using only the top 1024 sub-buckets
   * ...
   * </pre>
   *
   * Bucket 0 is "special" here. It is the only one that has 2048 entries. All the rest have 1024 entries (because
   * their bottom half overlaps with and is already covered by the all of the previous buckets put together). In other
   * words, the k'th bucket could represent 0 * 2^k to 2048 * 2^k in 2048 buckets with 2^k precision, but the midpoint
   * of 1024 * 2^k = 2048 * 2^(k-1) = the k-1'th bucket's end, so we would use the previous bucket for those lower
   * values as it has better precision.
   */
  establishSize(newHighestTrackableValue: number): void {
    // establish counts array length:
    this.countsArrayLength = this.determineArrayLengthNeeded(newHighestTrackableValue);
    // establish exponent range needed to support the trackable value with no overflow:
    this.bucketCount = this.getBucketsNeededToCoverValue(newHighestTrackableValue);
    // establish the new highest trackable value:
    this.highestTrackableValue = newHighestTrackableValue;
  }

  determineArrayLengthNeeded(highestTrackableValue: number): number {
    if (highestTrackableValue < 2 * this.lowestDiscernibleValue) {
      throw new Error("highestTrackableValue (" + highestTrackableValue +
        ") cannot be < (2 * lowestDiscernibleValue)");
    }
    //determine counts array length needed:
    const countsArrayLength = this.getLengthForNumberOfBuckets(this.getBucketsNeededToCoverValue(highestTrackableValue));
    return countsArrayLength;
  }

  /**
   * If we have N such that subBucketCount * 2^N > max value, we need storage for N+1 buckets, each with enough
   * slots to hold the top half of the subBucketCount (the lower half is covered by previous buckets), and the +1
   * being used for the lower half of the 0'th bucket. Or, equivalently, we need 1 more bucket to capture the max
   * value if we consider the sub-bucket length to be halved.
   */
  getLengthForNumberOfBuckets(numberOfBuckets: number): number {
    const lengthNeeded: number = (numberOfBuckets + 1) * (this.subBucketCount / 2);
    return lengthNeeded;
  }

  getBucketsNeededToCoverValue(value: number): number {
    // the k'th bucket can express from 0 * 2^k to subBucketCount * 2^k in units of 2^k
    let smallestUntrackableValue = this.subBucketCount * pow(2, this.unitMagnitude);
    // always have at least 1 bucket
    let bucketsNeeded = 1;
    while (smallestUntrackableValue <= value) {
      if (smallestUntrackableValue > (Number.MAX_SAFE_INTEGER / 2)) { // TODO check array max size in JavaScript
        // next shift will overflow, meaning that bucket could represent values up to ones greater than
        // Number.MAX_SAFE_INTEGER, so it's the last bucket
        return bucketsNeeded + 1;
      }
      smallestUntrackableValue = smallestUntrackableValue * 2;
      bucketsNeeded++;
    }
    return bucketsNeeded;
  }

  /**
   * Record a value in the histogram
   *
   * @param value The value to be recorded
   * @throws may throw Error if value is exceeds highestTrackableValue
   */
  recordValue(value: number) {
    this.recordSingleValue(value);
  }

  recordSingleValue(value: number) {
    const countsIndex = this.countsArrayIndex(value);
    if (countsIndex >= this.countsArrayLength) {
      this.handleRecordException(1, value);
    } else {
      this.incrementCountAtIndex(countsIndex);
    }
    this.updateMinAndMax(value);
    this.incrementTotalCount();
  }

  handleRecordException(count: number, value: number) {
    if(!this.autoResize) {
        throw "Value outside of histogram covered range";
    }
    this.resize(value);
    var countsIndex : number = this.countsArrayIndex(value);
    this.addToCountAtIndex(countsIndex, count);
    this.highestTrackableValue = this.highestEquivalentValue(this.valueFromIndex(this.countsArrayLength - 1));
  }

  countsArrayIndex(value: number): number {
    if (value < 0) {
      throw new Error("Histogram recorded value cannot be negative.");
    }
    const bucketIndex = this.getBucketIndex(value);
    const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
    return this.computeCountsArrayIndex(bucketIndex, subBucketIndex);
  }

  private computeCountsArrayIndex(bucketIndex: number, subBucketIndex: number) {
    // TODO
    //assert(subBucketIndex < subBucketCount);
    //assert(bucketIndex == 0 || (subBucketIndex >= subBucketHalfCount));

    // Calculate the index for the first entry that will be used in the bucket (halfway through subBucketCount).
    // For bucketIndex 0, all subBucketCount entries may be used, but bucketBaseIndex is still set in the middle.
    const bucketBaseIndex = (bucketIndex + 1) * pow(2, this.subBucketHalfCountMagnitude);
    // Calculate the offset in the bucket. This subtraction will result in a positive value in all buckets except
    // the 0th bucket (since a value in that bucket may be less than half the bucket's 0 to subBucketCount range).
    // However, this works out since we give bucket 0 twice as much space.
    const offsetInBucket = subBucketIndex - this.subBucketHalfCount;
    // The following is the equivalent of ((subBucketIndex  - subBucketHalfCount) + bucketBaseIndex;
    return bucketBaseIndex + offsetInBucket;
  }

  /**
   * @return the lowest (and therefore highest precision) bucket index that can represent the value
   */
  getBucketIndex(value: number) {
    // Calculates the number of powers of two by which the value is greater than the biggest value that fits in
    // bucket 0. This is the bucket index since each successive bucket can hold a value 2x greater.
    // The mask maps small values to bucket 0.

    // return this.leadingZeroCountBase - Long.numberOfLeadingZeros(value | subBucketMask);
    return max(floor(log2(value)) - this.subBucketHalfCountMagnitude, 0);
  }


  getSubBucketIndex(value: number, bucketIndex: number) {
    // For bucketIndex 0, this is just value, so it may be anywhere in 0 to subBucketCount.
    // For other bucketIndex, this will always end up in the top half of subBucketCount: assume that for some bucket
    // k > 0, this calculation will yield a value in the bottom half of 0 to subBucketCount. Then, because of how
    // buckets overlap, it would have also been in the top half of bucket k-1, and therefore would have
    // returned k-1 in getBucketIndex(). Since we would then shift it one fewer bits here, it would be twice as big,
    // and therefore in the top half of subBucketCount.
    return floor(value / pow(2, (bucketIndex + this.unitMagnitude)));
  }

  updateMinAndMax(value: number) {
    if (value > this.maxValue) {
      this.updatedMaxValue(value);
    }
    if ((value < this.minNonZeroValue) && (value !== 0)) {
      this.updateMinNonZeroValue(value);
    }
  }

  /**
   * Get the value at a given percentile.
   * When the given percentile is &gt; 0.0, the value returned is the value that the given
   * percentage of the overall recorded value entries in the histogram are either smaller than
   * or equivalent to. When the given percentile is 0.0, the value returned is the value that all value
   * entries in the histogram are either larger than or equivalent to.
   * <p>
   * Note that two values are "equivalent" in this statement if
   * {@link org.HdrHistogram.AbstractHistogram#valuesAreEquivalent} would return true.
   * 
   * @param percentile  The percentile for which to return the associated value
   * @return The value that the given percentage of the overall recorded value entries in the
   * histogram are either smaller than or equivalent to. When the percentile is 0.0, returns the
   * value that all value entries in the histogram are either larger than or equivalent to.
   */
  getValueAtPercentile(percentile: number) {
    const requestedPercentile = min(percentile, 100);  // Truncate down to 100%
    const countAtPercentile 
      = max(round((requestedPercentile / 100.0) * this.getTotalCount() + 0.5), 1); // round to nearest and make sure we at least reach the first recorded entry
    let totalToCurrentIndex = 0;
    for (let i = 0; i < this.countsArrayLength; i++) {
      totalToCurrentIndex += this.getCountAtIndex(i);
      if (totalToCurrentIndex >= countAtPercentile) {
        var valueAtIndex: number = this.valueFromIndex(i);
        return (percentile === 0.0) ? this.lowestEquivalentValue(valueAtIndex) : this.highestEquivalentValue(valueAtIndex);
      }
    }
    return 0;
  }

  valueFromIndexes(bucketIndex: number, subBucketIndex: number) {
    return subBucketIndex * pow(2, bucketIndex + this.unitMagnitude);
  }

  valueFromIndex(index: number) {
    let bucketIndex = floor(index / this.subBucketHalfCount) - 1;
    let subBucketIndex = (index % this.subBucketHalfCount) + this.subBucketHalfCount;
    if(bucketIndex < 0) {
      subBucketIndex -= this.subBucketHalfCount;
      bucketIndex = 0;
    }
    return this.valueFromIndexes(bucketIndex, subBucketIndex);
  }

  /**
   * Get the lowest value that is equivalent to the given value within the histogram's resolution.
   * Where "equivalent" means that value samples recorded for any two
   * equivalent values are counted in a common total count.
   * 
   * @param value The given value
   * @return The lowest value that is equivalent to the given value within the histogram's resolution.
   */
  lowestEquivalentValue(value: number) {
    const bucketIndex = this.getBucketIndex(value);
    const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
    const thisValueBaseLevel = this.valueFromIndexes(bucketIndex, subBucketIndex);
    return thisValueBaseLevel;
  }

  /**
   * Get the highest value that is equivalent to the given value within the histogram's resolution.
   * Where "equivalent" means that value samples recorded for any two
   * equivalent values are counted in a common total count.
   * 
   * @param value The given value
   * @return The highest value that is equivalent to the given value within the histogram's resolution.
   */
  highestEquivalentValue(value: number) {
    return this.nextNonEquivalentValue(value) - 1;
  }

  /**
   * Get the next value that is not equivalent to the given value within the histogram's resolution.
   * Where "equivalent" means that value samples recorded for any two
   * equivalent values are counted in a common total count.
   * 
   * @param value The given value
   * @return The next value that is not equivalent to the given value within the histogram's resolution.
   */
  nextNonEquivalentValue(value: number) {
    return this.lowestEquivalentValue(value) + this.sizeOfEquivalentValueRange(value);
  }

  /**
   * Get the size (in value units) of the range of values that are equivalent to the given value within the
   * histogram's resolution. Where "equivalent" means that value samples recorded for any two
   * equivalent values are counted in a common total count.
   * 
   * @param value The given value
   * @return The size of the range of values equivalent to the given value.
   */
  sizeOfEquivalentValueRange(value: number) {
    const bucketIndex = this.getBucketIndex(value);
    const subBucketIndex = this.getSubBucketIndex(value, bucketIndex);
    const distanceToNextValue 
      = pow(2, this.unitMagnitude + ((subBucketIndex >= this.subBucketCount) ? (bucketIndex + 1) : bucketIndex));
    return distanceToNextValue;
  }



}