import "core-js"
import * as fs from "fs";
import { expect } from "chai";
import HistogramLogReader from "./HistogramLogReader" 
import AbstractHistogram from "./AbstractHistogram" 


describe('Histogram Log Reader', () => {

  let reader: HistogramLogReader;
  before(() => {
    const fileContent = fs.readFileSync("test_files/jHiccup-2.0.7S.logV2.hlog", "UTF-8");
    reader = new HistogramLogReader(fileContent);
  })

  it.skip("should update startTimeSec reading first histogram", () => {
    // when
    reader.nextIntervalHistogram();
    // then
    expect(reader.startTimeSec).to.be.equal(1441812279.474);
  })
  
  it.skip("should read first histogram starting from the beginning", () => {
    // when
    const histogram = reader.nextIntervalHistogram();
    // then
    expect(histogram).to.be.not.null;
    expect((histogram as AbstractHistogram).maxValue).to.be.equal(2768895);
  })

})