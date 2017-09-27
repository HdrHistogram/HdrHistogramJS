import { expect } from "chai";
import Recorder from "./Recorder";
import Int32Histogram from "./Int32Histogram";

describe("Recorder", () => {
  it("should record value", () => {
    // given
    const recorder = new Recorder();
    // when
    recorder.recordValue(123);
    // then
    const histogram = recorder.getIntervalHistogram();
    expect(histogram.getTotalCount()).to.be.equal(1);
  });

  it("should record value with count", () => {
    // given
    const recorder = new Recorder();
    // when
    recorder.recordValueWithCount(123, 3);
    // then
    const histogram = recorder.getIntervalHistogram();
    expect(histogram.getTotalCount()).to.be.equal(3);
  });

  it("should record value with expected interval", () => {
    // given
    const recorder = new Recorder();
    // when
    recorder.recordValueWithExpectedInterval(223, 100);
    // then
    const histogram = recorder.getIntervalHistogram();
    expect(histogram.getTotalCount()).to.be.equal(2);
  });

  it("should record value only on one interval histogram", () => {
    // given
    const recorder = new Recorder();
    // when
    recorder.recordValue(123);
    const firstHistogram = recorder.getIntervalHistogram();
    // then
    const secondHistogram = recorder.getIntervalHistogram();
    expect(secondHistogram.getTotalCount()).to.be.equal(0);
  });

  it("should not record value on returned interval histogram", () => {
    // given
    const recorder = new Recorder();
    const firstHistogram = recorder.getIntervalHistogram();
    const secondHistogram = recorder.getIntervalHistogram();
    // when
    firstHistogram.recordValue(42); // should have 0 impact on recorder
    const thirdHistogram = recorder.getIntervalHistogram();
    // then
    expect(thirdHistogram.getTotalCount()).to.be.equal(0);
  });

  it("should return interval histograms with expected significant digits", () => {
    // given
    const recorder = new Recorder(4);
    const firstHistogram = recorder.getIntervalHistogram();
    const secondHistogram = recorder.getIntervalHistogram();
    // when
    const thirdHistogram = recorder.getIntervalHistogram();
    // then
    expect(thirdHistogram.numberOfSignificantValueDigits).to.be.equal(4);
  });

  it("should return recycled histograms when asking for interval histogram", () => {
    // given
    const recorder = new Recorder();
    const firstHistogram = recorder.getIntervalHistogram();
    // when
    const secondHistogram = recorder.getIntervalHistogram(firstHistogram);
    const thirdHistogram = recorder.getIntervalHistogram();
    // then
    expect(thirdHistogram === firstHistogram).to.be.true;
  });

  it("should throw an error when trying to recycle an histogram not created by the recorder", () => {
    // given
    const recorder = new Recorder();
    const somehistogram = new Int32Histogram(1, 2, 3);
    // when & then
    expect(() => recorder.getIntervalHistogram(somehistogram)).to.throw();
  });

  it("should reset histogram when recycling", () => {
    // given
    const recorder = new Recorder();
    recorder.recordValue(42);
    const firstHistogram = recorder.getIntervalHistogram();
    // when
    const secondHistogram = recorder.getIntervalHistogram(firstHistogram);
    const thirdHistogram = recorder.getIntervalHistogram();
    // then
    expect(thirdHistogram.getTotalCount()).to.be.equal(0);
  });

  it("should set timestamps on first interval histogram", () => {
    // given
    let currentTime = 42;
    let clock = () => currentTime;
    const recorder = new Recorder(3, clock);
    // when
    currentTime = 123;
    const histogram = recorder.getIntervalHistogram();
    // then
    expect(histogram.startTimeStampMsec).to.be.equal(42);
    expect(histogram.endTimeStampMsec).to.be.equal(123);
  });

  it("should set timestamps on any interval histogram", () => {
    // given
    let currentTime = 42;
    let clock = () => currentTime;
    const recorder = new Recorder(3, clock);
    currentTime = 51;
    const firstHistogram = recorder.getIntervalHistogram();
    // when
    currentTime = 56;
    const secondHistogram = recorder.getIntervalHistogram();
    // then
    expect(secondHistogram.startTimeStampMsec).to.be.equal(51);
    expect(secondHistogram.endTimeStampMsec).to.be.equal(56);
  });

  it("should copy interval histogram", () => {
    // given
    let currentTime = 42;
    let clock = () => currentTime;
    const recorder = new Recorder(4, clock);
    recorder.recordValue(123);
    // when
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    currentTime = 51;
    recorder.getIntervalHistogramInto(histogram);
    // then
    expect(histogram.getTotalCount()).to.be.equal(1);
    expect(histogram.startTimeStampMsec).to.be.equal(42);
    expect(histogram.endTimeStampMsec).to.be.equal(51);
  });

  it("should reset values and timestamp", () => {
    // given
    let currentTime = 42;
    let clock = () => currentTime;
    const recorder = new Recorder(4, clock);
    recorder.recordValue(123);
    // when
    currentTime = 55;
    recorder.reset();
    const histogram = recorder.getIntervalHistogram();
    // then
    expect(histogram.getTotalCount()).to.be.equal(0);
    expect(histogram.startTimeStampMsec).to.be.equal(55);
  });
});
