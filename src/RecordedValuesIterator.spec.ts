import RecordedValuesIterator from "./RecordedValuesIterator";
import Histogram from "./Int32Histogram";

describe("Recorded Values Iterator", () => {
  it("should iterate to recorded value", () => {
    // given
    const histogram = new Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.recordValue(123);
    const iterator = new RecordedValuesIterator(histogram);
    // when
    const iterationValue = iterator.next();
    // then
    expect(iterator.hasNext()).toBe(false);
    expect(iterationValue.totalCountToThisValue).toBe(1);
    expect(iterationValue.totalValueToThisValue).toBe(123);
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
    expect(values).toHaveLength(3);
    expect(values[0]).toBe(1);
    expect(values[1]).toBeGreaterThan(300);
    expect(values[2]).toBeGreaterThan(3000);
  });
});
