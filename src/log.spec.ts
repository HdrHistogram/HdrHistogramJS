import {
  HistogramLogWriter,
  HistogramLogReader,
  build,
  AbstractHistogram,
  Histogram,
} from ".";

describe("Logs", () => {
  it("should give same result after been written then read", () => {
    // given
    let buffer = "";
    const writer = new HistogramLogWriter((content) => {
      buffer += content;
    });
    writer.outputLogFormatVersion();
    writer.outputStartTime(12345000);
    writer.outputLegend();
    const inputHistogram = build() as AbstractHistogram;
    inputHistogram.recordValue(1515);
    inputHistogram.recordValue(1789);
    // when
    writer.outputIntervalHistogram(inputHistogram, 12345042, 1234056, 1);
    const reader = new HistogramLogReader(buffer);
    const outputHistogram = reader.nextIntervalHistogram();
    // then
    expect(outputHistogram).not.toBeNull();
    expect((outputHistogram as Histogram).mean).toBe(inputHistogram.mean);
  });
});
