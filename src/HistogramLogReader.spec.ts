import "core-js"
import * as fs from "fs";
import { expect } from "chai";
import HistogramLogReader from "./HistogramLogReader" 
import AbstractHistogram from "./AbstractHistogram" 

const { floor } = Math;

describe('Histogram Log Reader', () => {

  let fileContent: string;
  before(() => {
    fileContent = fs.readFileSync("test_files/jHiccup-2.0.7S.logV2.hlog", "UTF-8");
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
    expect(histogram).to.be.not.null;
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
    expect(histogram).to.be.not.null;
    // if mean is good, strong probability everything else is good as well
    expect(floor((histogram as AbstractHistogram).getMean())).to.be.equal(293719);
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
    expect(firstHistogram).to.be.not.null;
    expect(secondHistogram).to.be.not.null;
    expect(thirdHistogram).to.be.null;
    // if mean is good, strong probability everything else is good as well
    expect(floor((firstHistogram as AbstractHistogram).getMean())).to.be.equal(301998);
    expect(floor((secondHistogram as AbstractHistogram).getMean())).to.be.equal(293719);
  })

})