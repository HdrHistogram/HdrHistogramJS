import AbstractHistogram from "./AbstractHistogram"
import { encodeIntoBase64String } from "./encoding"

export interface Writable {
    (c: string):  void
}

class HistogramLogWriter {

    /**
     * Base time to subtract from supplied histogram start/end timestamps when
     * logging based on histogram timestamps.
     * Base time is expected to be in msec since the epoch, as histogram start/end times
     * are typically stamped with absolute times in msec since the epoch.
     */
    baseTime = 0;

    constructor(private log: Writable) {

    }

    /**
     * Output an interval histogram, with the given timestamp information and the [optional] tag
     * associated with the histogram, using a configurable maxValueUnitRatio. (note that the
     * specified timestamp information will be used, and the timestamp information in the actual
     * histogram will be ignored).
     * The max value reported with the interval line will be scaled by the given maxValueUnitRatio.
     * @param startTimeStampSec The start timestamp to log with the interval histogram, in seconds.
     * @param endTimeStampSec The end timestamp to log with the interval histogram, in seconds.
     * @param histogram The interval histogram to log.
     * @param maxValueUnitRatio The ratio by which to divide the histogram's max value when reporting on it.
     */
    outputIntervalHistogram(
        histogram: AbstractHistogram,
        startTimeStampSec = (histogram.startTimeStampMsec - this.baseTime) / 1000,
        endTimeStampSec = (histogram.endTimeStampMsec - this.baseTime) / 1000,
        maxValueUnitRatio = 1000000) {

        const base64 = encodeIntoBase64String(histogram);
        if (histogram.tag) {
            this.log(`Tag=${histogram.tag},${startTimeStampSec},${endTimeStampSec-startTimeStampSec},${histogram.maxValue/maxValueUnitRatio},${base64}\n`);
        } else {
            this.log(`${startTimeStampSec},${endTimeStampSec-startTimeStampSec},${histogram.maxValue/maxValueUnitRatio},${base64}\n`);
        }
    }
}

export default HistogramLogWriter;