import Histogram from "./Histogram";
import { decodeFromByteBuffer } from "./encoding";
import ByteBuffer from "./ByteBuffer";

export const UINT8ARRAY_ID = idof<Uint8Array>();

class HistogramAdapter<T, U> {
  private _histogram: Histogram<T, U>;
  constructor(
    lowestDiscernibleValue: f64,
    highestTrackableValue: f64,
    numberOfSignificantValueDigits: f64,
    autoResize: boolean,
    histogram: Histogram<T, U> | null = null
  ) {
    if (histogram) {
      this._histogram = histogram;
    } else {
      this._histogram = new Histogram<T, U>(
        <u64>lowestDiscernibleValue,
        <u64>highestTrackableValue,
        <u8>numberOfSignificantValueDigits
      );
      this._histogram.autoResize = autoResize;
    }
  }

  public get autoResize(): boolean {
    return this._histogram.autoResize;
  }

  public set autoResize(resize: boolean) {
    this._histogram.autoResize = resize;
  }

  public get highestTrackableValue(): f64 {
    return <f64>this._histogram.highestTrackableValue;
  }

  public set highestTrackableValue(value: f64) {
    this._histogram.highestTrackableValue = <u64>value;
  }

  public get startTimeStampMsec(): f64 {
    return <f64>this._histogram.startTimeStampMsec;
  }

  public set startTimeStampMsec(value: f64) {
    this._histogram.startTimeStampMsec = <u64>value;
  }

  public get endTimeStampMsec(): f64 {
    return <f64>this._histogram.endTimeStampMsec;
  }

  public set endTimeStampMsec(value: f64) {
    this._histogram.endTimeStampMsec = <u64>value;
  }

  public get minNonZeroValue(): f64 {
    return <f64>this._histogram.minNonZeroValue;
  }

  public get maxValue(): f64 {
    return <f64>this._histogram.maxValue;
  }

  public get totalCount(): f64 {
    return <f64>this._histogram.totalCount;
  }

  public get stdDeviation(): f64 {
    return <f64>this._histogram.getStdDeviation();
  }

  public get mean(): f64 {
    return <f64>this._histogram.getMean();
  }

  recordValue(value: f64): void {
    this._histogram.recordSingleValue(<u64>value);
  }

  recordValueWithCount(value: f64, count: f64): void {
    this._histogram.recordCountAtValue(<u64>count, <u64>value);
  }

  recordValueWithExpectedInterval(
    value: f64,
    expectedIntervalBetweenValueSamples: f64
  ): void {
    this._histogram.recordSingleValueWithExpectedInterval(
      <u64>value,
      <u64>expectedIntervalBetweenValueSamples
    );
  }

  getValueAtPercentile(percentile: f64): f64 {
    return <f64>this._histogram.getValueAtPercentile(percentile);
  }

  outputPercentileDistribution(
    percentileTicksPerHalfDistance: f64,
    outputValueUnitScalingRatio: f64
  ): string {
    return this._histogram.outputPercentileDistribution(
      <i32>percentileTicksPerHalfDistance,
      outputValueUnitScalingRatio
    );
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: f64
  ): HistogramAdapter<T, U> {
    const copy = this._histogram.copyCorrectedForCoordinatedOmission(
      <u64>expectedIntervalBetweenValueSamples
    );

    return new HistogramAdapter<T, U>(0, 0, 0, false, copy);
  }

  addHistogram8(otherHistogram: Histogram8): void {
    this._histogram.add(otherHistogram._histogram);
  }
  addHistogram16(otherHistogram: Histogram16): void {
    this._histogram.add(otherHistogram._histogram);
  }
  addHistogram32(otherHistogram: Histogram32): void {
    this._histogram.add(otherHistogram._histogram);
  }
  addHistogram64(otherHistogram: Histogram64): void {
    this._histogram.add(otherHistogram._histogram);
  }

  subtractHistogram8(otherHistogram: Histogram8): void {
    this._histogram.subtract(otherHistogram._histogram);
  }
  subtractHistogram16(otherHistogram: Histogram16): void {
    this._histogram.subtract(otherHistogram._histogram);
  }
  subtractHistogram32(otherHistogram: Histogram32): void {
    this._histogram.subtract(otherHistogram._histogram);
  }
  subtractHistogram64(otherHistogram: Histogram64): void {
    this._histogram.subtract(otherHistogram._histogram);
  }

  encode(): Uint8Array {
    return this._histogram.encode();
  }

  encode2(): void {
    this._histogram.encode();
  }

  reset(): void {
    this._histogram.reset();
  }
}

export class Histogram8 extends HistogramAdapter<Uint8Array, u8> {}
export class Histogram16 extends HistogramAdapter<Uint16Array, u16> {}
export class Histogram32 extends HistogramAdapter<Uint32Array, u32> {}
export class Histogram64 extends HistogramAdapter<Uint64Array, u64> {}

function decodeHistogram<T, U>(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<T, U> {
  const buffer = new ByteBuffer(data);
  const histogram = decodeFromByteBuffer<T, U>(
    buffer,
    <u64>minBarForHighestTrackableValue
  );
  return new HistogramAdapter<T, U>(0, 0, 0, false, histogram);
}

export function decodeHistogram8(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint8Array, u8> {
  return decodeHistogram<Uint8Array, u8>(data, minBarForHighestTrackableValue);
}
export function decodeHistogram16(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint16Array, u16> {
  return decodeHistogram<Uint16Array, u16>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodeHistogram32(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint32Array, u32> {
  return decodeHistogram<Uint32Array, u32>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodeHistogram64(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint64Array, u64> {
  return decodeHistogram<Uint64Array, u64>(
    data,
    minBarForHighestTrackableValue
  );
}
