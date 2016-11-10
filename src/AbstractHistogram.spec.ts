import { expect } from "chai";
import { AbstractHistogram } from "./AbstractHistogram" 


describe('Histogram initialization', () => {

  it("should set sub bucket size", () => {
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    expect(histogram.subBucketCount).to.be.equal(2048);
  })

  it("should set resize to false when max value specified", () => {
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    expect(histogram.autoResize).to.be.false;
  })

  it("should compute counts array length", () => {
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    expect(histogram.countsArrayLength).to.be.equal(45056);
  })

  it("should compute bucket count", () => {
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    expect(histogram.bucketCount).to.be.equal(43);
  })

});

class HistogramForTests extends AbstractHistogram {

  //constructor() {}

  incrementCountAtIndex(index: number): void {
  }

  setNormalizingIndexOffset(normalizingIndexOffset: number): void {
  }

  incrementTotalCount(): void {
  }

}