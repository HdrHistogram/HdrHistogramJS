import { AbstractHistogramBase } from "./AbstractHistogramBase"

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
  /**
   * Biggest value that can fit in bucket 0
   */
  subBucketMask: number;
  /**
   * Lowest unitMagnitude bits are set
   */
  unitMagnitudeMask: number;

  maxValue: number = 0;
  minNonZeroValue : number = Number.MAX_SAFE_INTEGER;

  /*
  private static maxValueUpdater : AtomicLongFieldUpdater<AbstractHistogram>; public static maxValueUpdater_$LI$() : AtomicLongFieldUpdater<AbstractHistogram> { if(AbstractHistogram.maxValueUpdater == null) AbstractHistogram.maxValueUpdater = AtomicLongFieldUpdater.newUpdater<any>(AbstractHistogram, "maxValue"); return AbstractHistogram.maxValueUpdater; };
  private static minNonZeroValueUpdater : AtomicLongFieldUpdater<AbstractHistogram>; public static minNonZeroValueUpdater_$LI$() : AtomicLongFieldUpdater<AbstractHistogram> { if(AbstractHistogram.minNonZeroValueUpdater == null) AbstractHistogram.minNonZeroValueUpdater = AtomicLongFieldUpdater.newUpdater<any>(AbstractHistogram, "minNonZeroValue"); return AbstractHistogram.minNonZeroValueUpdater; };
  */

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

  abstract getCountAtNormalizedIndex(index: number): number;

  abstract incrementCountAtIndex(index: number): void;

  abstract addToCountAtIndex(index: number, value: number): void;

  abstract setCountAtIndex(index: number, value: number): void;

  abstract setCountAtNormalizedIndex(index: number, value: number): void;

  abstract getNormalizingIndexOffset(): number;

  abstract setNormalizingIndexOffset(normalizingIndexOffset: number): void;

  abstract shiftNormalizingIndexByOffset(offsetToAdd: number, lowestHalfBucketPopulated: boolean): void;

  abstract setTotalCount(totalCount: number): void;

  abstract incrementTotalCount(): void;

  abstract addToTotalCount(value: number): void;

  abstract clearCounts(): void;

  abstract _getEstimatedFootprintInBytes(): number;

  abstract resize(newHighestTrackableValue: number): void;

  /**
   * Get the total count of all recorded values in the histogram
   * @return the total count of all recorded values in the histogram
   */
  abstract getTotalCount(): number;

  private updatedMaxValue(value: number): void  {
    const internalValue : number = value | this.unitMagnitudeMask;
    this.maxValue = internalValue;
  }

  // TODO clean up
  private resetMaxValue(value: number): void  {
    this.updatedMaxValue(value);
  }

  private updateMinNonZeroValue(value: number): void {
    if(value <= this.unitMagnitudeMask) {
        return;
    }
    const internalValue: number = value & ~this.unitMagnitudeMask;
    this.minNonZeroValue = internalValue;
  }
  // TODO clean up
  private resetMinNonZeroValue(minNonZeroValue : number) {
      var internalValue: number = minNonZeroValue & ~this.unitMagnitudeMask;
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
      if(normalizingIndexOffset !== 0) {
          this.setNormalizingIndexOffset(normalizingIndexOffset);
      }
      
       /*
        * Given a 3 decimal point accuracy, the expectation is obviously for "+/- 1 unit at 1000". It also means that
        * it's "ok to be +/- 2 units at 2000". The "tricky" thing is that it is NOT ok to be +/- 2 units at 1999. Only
        * starting at 2000. So internally, we need to maintain single unit resolution to 2x 10^decimalPoints.
        */
      const largestValueWithSingleUnitResolution = 2 * Math.round(Math.pow(10, numberOfSignificantValueDigits));
      
      this.unitMagnitude = Math.floor(Math.log2(lowestDiscernibleValue));
      this.unitMagnitudeMask = (1 << this.unitMagnitude) - 1;

      // We need to maintain power-of-two subBucketCount (for clean direct indexing) that is large enough to
      // provide unit resolution to at least largestValueWithSingleUnitResolution. So figure out
      // largestValueWithSingleUnitResolution's nearest power-of-two (rounded up), and use that:
      const subBucketCountMagnitude = Math.ceil(Math.log2(largestValueWithSingleUnitResolution));
      this.subBucketHalfCountMagnitude = ((subBucketCountMagnitude > 1) ? subBucketCountMagnitude : 1) - 1;
      this.subBucketCount = Math.pow(2, this.subBucketHalfCountMagnitude + 1);
      this.subBucketHalfCount = this.subBucketCount / 2;
      this.subBucketMask = (Math.round(this.subBucketCount) - 1) << this.unitMagnitude;

      this.establishSize(highestTrackableValue);

      // TODO was 64 but in JS this should be 53, right?
      this.leadingZeroCountBase = 53 - this.unitMagnitude - this.subBucketHalfCountMagnitude - 1;
      //this.percentileIterator = new PercentileIterator(this, 1);
      //this.recordedValuesIterator = new RecordedValuesIterator(this);
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
    getLengthForNumberOfBuckets(numberOfBuckets : number): number {
        var lengthNeeded: number = (numberOfBuckets + 1) * (this.subBucketCount / 2);
        return lengthNeeded;
    }

    getBucketsNeededToCoverValue(value: number): number {
        // the k'th bucket can express from 0 * 2^k to subBucketCount * 2^k in units of 2^k
        let smallestUntrackableValue = this.subBucketCount << this.unitMagnitude;

        // always have at least 1 bucket
        let bucketsNeeded = 1;
        while (smallestUntrackableValue <= value) {
            if (smallestUntrackableValue > (Number.MAX_SAFE_INTEGER / 2)) { // TODO check array max size in JavaScript
                // next shift will overflow, meaning that bucket could represent values up to ones greater than
                // Number.MAX_SAFE_INTEGER, so it's the last bucket
                return bucketsNeeded + 1;
            }
            smallestUntrackableValue <<= 1;
            bucketsNeeded++;
        }
        return bucketsNeeded;
    }


}