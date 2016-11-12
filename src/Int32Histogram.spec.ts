import "core-js"
import { expect } from "chai";
import Histogram from "./Int32Histogram" 

describe('Int32 histogram', () => {
  
  it("should record a value", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123456); 
    // then
    expect(histogram.counts[8073]).equals(1);
  })

})