import "core-js"
import * as fs from "fs";
import { expect } from "chai";
import HistogramLogReader from "./HistogramLogReader" 
import AbstractHistogram from "./AbstractHistogram" 


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
    expect(Math.floor((histogram as AbstractHistogram).getMean())).to.be.equal(301998); 
  })

})