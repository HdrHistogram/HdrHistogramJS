import "core-js";
import * as fs from "fs";
import { expect } from "chai";
import HistogramLogReader, { listTags } from "./HistogramLogReader";
import AbstractHistogram from "./AbstractHistogram";
import Int32Histogram from "./Int32Histogram";

const { floor } = Math;

const checkNotNull = <T>(actual: T | null): actual is T => {
  expect(actual).to.be.not.null;
  return true;
};

describe("Histogram Log Reader", () => {
  let fileContent: string;
  let tagFileContent: string;
  let fileContentWithBaseTime: string;
  let fileContentWithoutHeader: string;
  before(() => {
    // when using mutation testing tool stryker, source code
    // is copied in a sandbox directory without the test_files
    // directory...
    const runFromStryker = __dirname.includes("stryker");
    const prefix = runFromStryker ? "../.." : ".";

    fileContent = fs.readFileSync(
      `${prefix}/test_files/jHiccup-2.0.7S.logV2.hlog`,
      "UTF-8"
    );
    fileContentWithBaseTime = fs.readFileSync(
      `${prefix}/test_files/jHiccup-with-basetime-2.0.7S.logV2.hlog`,
      "UTF-8"
    );
    fileContentWithoutHeader = fs.readFileSync(
      `${prefix}/test_files/jHiccup-no-header-2.0.7S.logV2.hlog`,
      "UTF-8"
    );
    tagFileContent = fs.readFileSync(
      `${prefix}/test_files/tagged-Log.logV2.hlog`,
      "UTF-8"
    );
  });

  it("should update startTimeSec reading first histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    reader.nextIntervalHistogram();
    // then
    expect(reader.startTimeSec).to.be.equal(1441812279.474);
  });

  it("should read first histogram starting from the beginning", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    checkNotNull(histogram);
    // if mean is good, strong probability everything else is good as well
    expect(floor((histogram as AbstractHistogram).getMean())).to.be.equal(
      301998
    );
  });

  it("should return null if no histogram in the logs", () => {
    // given
    const reader = new HistogramLogReader("# empty");
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    expect(histogram).to.be.null;
  });

  it("should return next histogram in the logs", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    reader.nextIntervalHistogram();
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      // if mean is good, strong probability everything else is good as well
      expect(floor(histogram.getMean())).to.be.equal(293719);
    }
  });

  it("should return null if all histograms are after specified time range", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram(0.01, 0.1);
    // then
    expect(histogram).to.be.null;
  });

  it("should return null if all histograms are before specified time range", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram(62, 63);
    // then
    expect(histogram).to.be.null;
  });

  it("should return histograms within specified time range", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const firstHistogram = reader.nextIntervalHistogram(0, 2);
    const secondHistogram = reader.nextIntervalHistogram(0, 2);
    const thirdHistogram = reader.nextIntervalHistogram(0, 2);
    // then
    expect(thirdHistogram).to.be.null;
    if (checkNotNull(firstHistogram) && checkNotNull(secondHistogram)) {
      // if mean is good, strong probability everything else is good as well
      expect(floor(firstHistogram.getMean())).to.be.equal(301998);
      expect(floor(secondHistogram.getMean())).to.be.equal(293719);
    }
  });

  it("should set start timestamp on histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.startTimeStampMsec).to.be.equal(1441812279601);
    }
  });

  it("should set end timestamp on histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.endTimeStampMsec).to.be.equal(1441812280608);
    }
  });

  it("should parse tagged histogram", () => {
    // given
    const reader = new HistogramLogReader(tagFileContent);
    reader.nextIntervalHistogram();
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.tag).to.be.equal("A");
      expect(floor(histogram.getMean())).to.be.equal(301998);
    }
  });

  it("should use basetime to set timestamps on histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContentWithBaseTime);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.startTimeStampMsec).to.be.equal(1441812123250);
      expect(histogram.endTimeStampMsec).to.be.equal(1441812124257);
    }
  });

  it("should default startTime using 1st observed time", () => {
    // given
    const reader = new HistogramLogReader(fileContentWithoutHeader);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.startTimeStampMsec).to.be.equal(127);
      expect(histogram.endTimeStampMsec).to.be.equal(1134);
    }
  });

  it("should do the whole 9 yards just like the original Java version :-)", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    const accumulatedHistogram = new Int32Histogram(
      1,
      Number.MAX_SAFE_INTEGER,
      3
    );
    let histogram: AbstractHistogram | null;
    let histogramCount = 0;
    let totalCount = 0;

    // when
    while ((histogram = reader.nextIntervalHistogram()) != null) {
      histogramCount++;
      totalCount += histogram.getTotalCount();
      accumulatedHistogram.add(histogram);
    }

    // then
    expect(histogramCount).to.be.equal(62);
    expect(totalCount).to.be.equal(48761);
    expect(accumulatedHistogram.getValueAtPercentile(99.9)).to.be.equal(
      1745879039
    );
    expect(reader.startTimeSec).to.be.equal(1441812279.474);
  });

  it("should list all the tags of a log file", () => {
    // given
    // when
    const tags = listTags(tagFileContent);
    // then
    expect(tags).to.be.deep.equal(["NO TAG", "A"]);
  });

  it("should list all the tags of alog filr where all histograms are tagged", () => {
    // given
    const content = `#[Fake log chunk]
#[Histogram log format version 1.2]
#[StartTime: 1441812279.474 (seconds since epoch), Wed Sep 09 08:24:39 PDT 2015]
"StartTimestamp","Interval_Length","Interval_Max","Interval_Compressed_Histogram"
Tag=NOT-EMPTY,0.127,1.007,2.769,HISTFAAAAEV42pNpmSzMwMCgyAABTBDKT4GBgdnNYMcCBvsPEBEJISEuATEZMQ4uASkhIR4nrxg9v2lMaxhvMekILGZkKmcCAEf2CsI=
Tag=A,0.127,1.007,2.769,HISTFAAAAEV42pNpmSzMwMCgyAABTBDKT4GBgdnNYMcCBvsPEBEJISEuATEZMQ4uASkhIR4nrxg9v2lMaxhvMekILGZkKmcCAEf2CsI=
`;
    // when
    const tags = listTags(content);
    // then
    expect(tags).to.be.deep.equal(["NOT-EMPTY", "A"]);
  });
});
