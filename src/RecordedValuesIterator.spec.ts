import "core-js"
import { expect } from "chai";
import RecordedValuesIterator from "./RecordedValuesIterator";
import Histogram from "./Int32Histogram" ;

describe('Recorded Values Iterator', () => {
  
  it("should iterate to recorded value", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 5);
    histogram.recordValue(12345); 
    const iterator = new RecordedValuesIterator(histogram);
    // when
    const iterationValue = iterator.next();
    // then
    expect(iterator.hasNext()).is.false;
    expect(iterationValue.totalCountToThisValue).equals(1);
    expect(iterationValue.totalValueToThisValue).equals(12345);
  });
});
