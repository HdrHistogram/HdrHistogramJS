import "core-js"
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

  getTotalCount() {
    return 0;
  }

  getCountAtIndex(index: number): number  {
    return 0;
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

  it("should set min non zero value", () => {
    expect(histogram.minNonZeroValue).to.be.equal(Number.MAX_SAFE_INTEGER);
  })

  it("should set max value", () => {
    expect(histogram.maxValue).to.be.equal(0);
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

  it("should update min non zero value", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123); 
    // then
    expect(histogram.minNonZeroValue).to.be.equal(123);
    
  })

  it("should update max value", () => {
    // given
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    // when
    histogram.recordValue(123); 
    // then
    expect(histogram.maxValue).to.be.equal(123);
    
  })

/*
  it("should bench", () => {
    const histogram = new HistogramForTests(1, Number.MAX_SAFE_INTEGER, 3);
    for (var i = 0; i < 1000; i++) {
       histogram.recordValue(Math.floor(Math.random() * 100000));
    }
    const start = new Date().getTime();
    const nbLoop = 100000;
    for (var i = 0; i < nbLoop; i++) {
       histogram.recordValue(Math.floor(Math.random() * 100000));
    }
    const end = new Date().getTime();
    console.log("avg", (end - start)/nbLoop );

  }) 
*/
});
