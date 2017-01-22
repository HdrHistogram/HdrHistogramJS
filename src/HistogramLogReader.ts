/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./AbstractHistogram";
import { decodeFromCompressedBase64 } from "./encoding";


/**
 * A histogram log reader.
 * <p>
 * Histogram logs are used to capture full fidelity, per-time-interval
 * histograms of a recorded value.
 * <p>
 * For example, a histogram log can be used to capture high fidelity
 * reaction-time logs for some measured system or subsystem component.
 * Such a log would capture a full reaction time histogram for each
 * logged interval, and could be used to later reconstruct a full
 * HdrHistogram of the measured reaction time behavior for any arbitrary
 * time range within the log, by adding [only] the relevant interval
 * histograms.
 * <h3>Histogram log format:</h3>
 * A histogram log file consists of text lines. Lines beginning with
 * the "#" character are optional and treated as comments. Lines
 * containing the legend (starting with "Timestamp") are also optional
 * and ignored in parsing the histogram log. All other lines must
 * be valid interval description lines. Text fields are delimited by
 * commas, spaces.
 * <p>
 * A valid interval description line contains an optional Tag=tagString
 * text field, followed by an interval description.
 * <p>
 * A valid interval description must contain exactly four text fields:
 * <ul>
 * <li>StartTimestamp: The first field must contain a number parse-able as a Double value,
 * representing the start timestamp of the interval in seconds.</li>
 * <li>intervalLength: The second field must contain a number parse-able as a Double value,
 * representing the length of the interval in seconds.</li>
 * <li>Interval_Max: The third field must contain a number parse-able as a Double value,
 * which generally represents the maximum value of the interval histogram.</li>
 * <li>Interval_Compressed_Histogram: The fourth field must contain a text field
 * parse-able as a Base64 text representation of a compressed HdrHistogram.</li>
 * </ul>
 * The log file may contain an optional indication of a starting time. Starting time
 * is indicated using a special comments starting with "#[StartTime: " and followed
 * by a number parse-able as a double, representing the start time (in seconds)
 * that may be added to timestamps in the file to determine an absolute
 * timestamp (e.g. since the epoch) for each interval.
 */
class HistogramLogReader {

  startTimeSec: number;
  baseTimeSec: number;

  lines: string[];
  currentLineIndex: number;

  constructor(logContent: string) {
    this.lines = logContent.split(/\r\n|\r|\n/g);
    this.currentLineIndex = 0;
  }

  /**
   * Read the next interval histogram from the log. Returns a Histogram object if
   * an interval line was found, or null if not.
   * <p>Upon encountering any unexpected format errors in reading the next interval
   * from the file, this method will return a null.
   * @return a DecodedInterval, or a null if no appropriate interval found
   */
  public nextIntervalHistogram(startTimeSec = 0, endTimeSec = Number.MAX_VALUE): AbstractHistogram | null {
    
    while (this.currentLineIndex < this.lines.length) {
      const currentLine = this.lines[this.currentLineIndex];
      this.currentLineIndex++;
      if (currentLine.startsWith("#[StartTime:")) {
        this.parseStartTimeFromLine(currentLine);
      } else if (currentLine.startsWith("#") || currentLine.startsWith('"StartTimestamp"')) {
        // skip legend & meta data for now
      } else if (currentLine.indexOf(",") > -1) {       
        const [rawLogTimeStampInSec, rawIntervalLengthSec, , base64Histogram] = currentLine.split(",");
        const logTimeStampInSec = Number.parseFloat(rawLogTimeStampInSec);
        if (endTimeSec < logTimeStampInSec) {
          return null;
        }
        if (logTimeStampInSec < startTimeSec) {
          continue;
        }
        const histogram = decodeFromCompressedBase64(base64Histogram);
        histogram.startTimeStampMsec = (this.startTimeSec + logTimeStampInSec) * 1000;
        const intervalLengthSec = Number.parseFloat(rawIntervalLengthSec);
        histogram.endTimeStampMsec = (this.startTimeSec + logTimeStampInSec + intervalLengthSec) * 1000;
        return histogram;
      }
    }
    return null;
  }
  
  private parseStartTimeFromLine(line: string) {
    this.startTimeSec = Number.parseFloat(line.split(" ")[1]);
  }

}

export default HistogramLogReader;