import { expect } from "chai";
import HistogramLogWriter from "./HistogramLogWriter";
import Int32Histogram from "./Int32Histogram";

describe('Histogram Log Writer', () => {
    
    it("should write a line with start time, duration, max value, and a base64 encoded histogram", () => {
        // given
        let buffer = "";
        const writer = new HistogramLogWriter((content) => { buffer += content });
        const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.recordValue(123000000);
        // when
        writer.outputIntervalHistogram(histogram, 1000, 1042);
        // then
        expect(buffer).to.contain("1000,42,123,HISTFAA");
    })

    it("should write a line starting with histogram tag", () => {
        // given
        let buffer = "";
        const writer = new HistogramLogWriter((content) => { buffer += content });
        const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.tag = "TAG";
        histogram.recordValue(123000000);
        // when
        writer.outputIntervalHistogram(histogram, 1000, 1042);
        // then
        expect(buffer).to.contain("Tag=TAG,1000,42,123,HISTFAA");
    })

    it("should write a histogram's start/end times in ms using basetime", () => {
        // given
        let buffer = "";
        const writer = new HistogramLogWriter((content) => { buffer += content });
        const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
        histogram.startTimeStampMsec = 1234000;
        histogram.endTimeStampMsec = 1235000;
        writer.baseTime = 1000000;
        histogram.recordValue(1);
        // when
        writer.outputIntervalHistogram(histogram);
        // then
        expect(buffer).to.contain("234,1");
    })

})