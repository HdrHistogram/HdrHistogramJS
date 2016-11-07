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
  public abstract getTotalCount(): number;

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

      // TODO....
      // this.establishSize(highestTrackableValue);

      // TODO was 64 but in JS this should be 53, right?
      this.leadingZeroCountBase = 53 - this.unitMagnitude - this.subBucketHalfCountMagnitude - 1;
      //this.percentileIterator = new PercentileIterator(this, 1);
      //this.recordedValuesIterator = new RecordedValuesIterator(this);
    }


}