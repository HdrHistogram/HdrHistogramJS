import { expect } from "chai";
import { AbstractHistogram } from "./AbstractHistogram" 



class HistogramForTests extends AbstractHistogram {

  //constructor() {}

  incrementCountAtIndex(index: number): void {
  }

  setNormalizingIndexOffset(normalizingIndexOffset: number): void {
  }

  incrementTotalCount(): void {
  }

}

describe('Histogram initialization', () => {
  
  const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);

  it("should set sub bucket size", () => {
    expect(histogram.subBucketCount).to.be.equal(2048);
  })

  it("should set resize to false when max value specified", () => {
    expect(histogram.autoResize).to.be.false;
  })

  it("should compute counts array length", () => {
    expect(histogram.countsArrayLength).to.be.equal(45056);
  })

  it("should compute bucket count", () => {
    expect(histogram.bucketCount).to.be.equal(43);
  })

});

describe('Histogram recording values', () => {

  it("should compute count index when value in first bucket", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    const index = histogram.countsArrayIndex(2000); // 2000 < 2048
    expect(index).to.be.equal(2000);
  })

  it("should compute count index when value outside first bucket", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    const index = histogram.countsArrayIndex(2050); // 2050 > 2048
    // then
    expect(index).to.be.equal(2049);
  })

  it("should compute count index when value outside second bucket 2", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    const index = histogram.countsArrayIndex(123456); 
    // then
    expect(index).to.be.equal(8073);
  })

});
