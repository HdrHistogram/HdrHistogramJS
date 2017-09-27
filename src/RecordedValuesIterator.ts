/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import AbstractHistogram from "./AbstractHistogram";
import AbstractHistogramIterator from "./AbstractHistogramIterator";

/**
 * Used for iterating through all recorded histogram values using the finest granularity steps supported by the
 * underlying representation. The iteration steps through all non-zero recorded value counts, and terminates when
 * all recorded histogram values are exhausted.
 */
class RecordedValuesIterator extends AbstractHistogramIterator {
  visitedIndex: number;

  /**
   * @param histogram The histogram this iterator will operate on
   */
  constructor(histogram: AbstractHistogram) {
    super();
    this.doReset(histogram);
  }

  /**
   * Reset iterator for re-use in a fresh iteration over the same histogram data set.
   */
  public reset() {
    this.doReset(this.histogram);
  }

  private doReset(histogram: AbstractHistogram) {
    super.resetIterator(histogram);
    this.visitedIndex = -1;
  }

  incrementIterationLevel() {
    this.visitedIndex = this.currentIndex;
  }

  reachedIterationLevel() {
    const currentCount = this.histogram.getCountAtIndex(this.currentIndex);
    return currentCount != 0 && this.visitedIndex !== this.currentIndex;
  }
}

export default RecordedValuesIterator;
