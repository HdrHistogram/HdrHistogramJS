/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import Int32Histogram from "./Int32Histogram"
import AbstractHistogram from "./AbstractHistogram"

interface HistogramWithId extends AbstractHistogram {
  containingInstanceId?: number 
}

/**
 * Records integer values, and provides stable interval {@link Histogram} samples from
 * live recorded data without interrupting or stalling active recording of values. Each interval
 * histogram provided contains all value counts accumulated since the previous interval histogram
 * was taken.
 * <p>
 * This pattern is commonly used in logging interval histogram information while recording is ongoing.
 * <p>
 * {@link Recorder} supports concurrent
 * {@link Recorder#recordValue} or
 * {@link Recorder#recordValueWithExpectedInterval} calls.
 *
 */
class Recorder {
  
  static idGenerator = 0;
  private activeHistogram: HistogramWithId;
  private inactiveHistogram: HistogramWithId | null | undefined;

  /**
   * Construct an auto-resizing {@link Recorder} with a lowest discernible value of
   * 1 and an auto-adjusting highestTrackableValue. Can auto-resize up to track values up to Number.MAX_SAFE_INTEGER.
   *
   * @param numberOfSignificantValueDigits Specifies the precision to use. This is the number of significant
   *                                       decimal digits to which the histogram will maintain value resolution
   *                                       and separation. Must be a non-negative integer between 0 and 5.
   */
  constructor(public numberOfSignificantValueDigits = 3) {

    this.activeHistogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, numberOfSignificantValueDigits);
    this.inactiveHistogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, numberOfSignificantValueDigits);
    
    Recorder.idGenerator++;
    this.activeHistogram.containingInstanceId = Recorder.idGenerator;
    this.inactiveHistogram.containingInstanceId = Recorder.idGenerator;
    
  }


  /**
   * Record a value in the histogram
   *
   * @param value The value to be recorded
   * @throws may throw Error if value is exceeds highestTrackableValue
   */
  recordValue(value: number) {
    this.activeHistogram.recordValue(value);
  }

  getIntervalHistogram(histogramToRecycle?: AbstractHistogram): AbstractHistogram {
    this.inactiveHistogram = histogramToRecycle;
    this.performIntervalSample();
    const sampledHistogram = this.inactiveHistogram;
    this.inactiveHistogram = null; // Once we expose the sample, we can't reuse it internally until it is recycled
    return sampledHistogram as AbstractHistogram;
  }

  private performIntervalSample() {
    if (!this.inactiveHistogram) {
      this.inactiveHistogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, this.numberOfSignificantValueDigits);
    }
    this.inactiveHistogram.reset();
    const tempHistogram = this.activeHistogram;
    this.activeHistogram = this.inactiveHistogram;
    this.inactiveHistogram = tempHistogram;
  }
}

export default Recorder;