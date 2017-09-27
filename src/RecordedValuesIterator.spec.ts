import "core-js";
import { expect } from "chai";
import RecordedValuesIterator from "./RecordedValuesIterator";
import Histogram from "./Int32Histogram";

describe("Recorded Values Iterator", () => {
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

  it("should iterate to all recorded values", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.recordValue(1);
    histogram.recordValue(300);
    histogram.recordValue(3000);
    const iterator = new RecordedValuesIterator(histogram);
    // when
    const values: number[] = [];
    while (iterator.hasNext()) {
      values.push(iterator.next().valueIteratedTo);
    }
    // then
    expect(values).to.have.length(3);
    expect(values[0]).equals(1);
    expect(values[1]).satisfies((value: number) => value >= 300);
    expect(values[2]).satisfies((value: number) => value >= 3000);
  });
});
