import "core-js"
import { expect } from "chai";
import * as hdr from "./index" 

describe('Histogram builder', () => {
  
  it("should build histogram with default values", () => {
    // given
    // when
    const histogram = hdr.build();
    // then
    expect(histogram).to.be.not.null;
    expect(histogram.autoResize).to.be.true;
    expect(histogram.highestTrackableValue).to.be.equal(2);
  });

  it("should build histogram with custom parameters", () => {
    // given
    // when
    const histogram 
      = hdr.build({ bitBucketSize: 32, numberOfSignificantValueDigits: 2});
    const expectedHistogram 
      = new hdr.Int32Histogram(1, 2, 2);
    expectedHistogram.autoResize = true;

    histogram.recordValue(12345678);
    expectedHistogram.recordValue(12345678);
   
    // then
    expect(
      histogram.outputPercentileDistribution()
    ).to.be.equal(
      expectedHistogram.outputPercentileDistribution()
    );
  });

});