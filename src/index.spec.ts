import "core-js"
import { expect } from "chai";
import * as hdr from "./index" 

describe('Integer formatter', () => {
  
  it("should build histogram with default values", () => {
    // given
    // when
    const histogram = hdr.build();
    // then
    expect(histogram).to.be.not.null;
  });

  it("should build histogram with custom parameters", () => {
    // given
    // when
    const histogram 
      = hdr.build({ bitBucketSize: 8, numberOfSignificantValueDigits: 2});
    const expectedHistogram 
      = new hdr.Int8Histogram(1, Number.MAX_SAFE_INTEGER, 2);

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