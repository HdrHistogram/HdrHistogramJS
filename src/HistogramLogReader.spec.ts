import "core-js"
import * as fs from "fs";
import { expect } from "chai";
import HistogramLogReader from "./HistogramLogReader" 
import AbstractHistogram from "./AbstractHistogram" 

const { floor } = Math;

const checkNotNull = <T>(actual: T | null): actual is T => {
  expect(actual).to.be.not.null;
  return true;
}

describe('Histogram Log Reader', () => {

  let fileContent: string;
  let tagFileContent: string;
  before(() => {
    fileContent = fs.readFileSync("test_files/jHiccup-2.0.7S.logV2.hlog", "UTF-8");
    tagFileContent = fs.readFileSync("test_files/tagged-Log.logV2.hlog", "UTF-8");
  })

  it("should update startTimeSec reading first histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    reader.nextIntervalHistogram();
    // then
    expect(reader.startTimeSec).to.be.equal(1441812279.474);
  })
  
  it("should read first histogram starting from the beginning", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    checkNotNull(histogram);
    // if mean is good, strong probability everything else is good as well
    expect(floor((histogram as AbstractHistogram).getMean())).to.be.equal(301998); 
  })

  it("should return null if no histogram in the logs", () => {
    // given
    const reader = new HistogramLogReader("# empty");
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    expect(histogram).to.be.null;
  })

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
  })

  it("should return null if all histograms are after specified time range", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram(0.01, 0.1);
    // then
    expect(histogram).to.be.null;
  })

  it("should return null if all histograms are before specified time range", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram(62, 63);
    // then
    expect(histogram).to.be.null;
  })

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
  })

  it("should set start timestamp on histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.startTimeStampMsec).to.be.equal(1441812279601);
    }
  })

  it("should set end timestamp on histogram", () => {
    // given
    const reader = new HistogramLogReader(fileContent);
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    if (checkNotNull(histogram)) {
      expect(histogram.endTimeStampMsec).to.be.equal(1441812280608);
    }
  })

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
  })



})