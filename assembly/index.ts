/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

import Histogram from "./Histogram";
import {
  Uint8Storage,
  Uint16Storage,
  Uint32Storage,
  Uint64Storage,
} from "./Histogram";
import { decodeFromByteBuffer } from "./encoding";
import ByteBuffer from "./ByteBuffer";
import { PackedArray } from "./packedarray/PackedArray";

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

  public get estimatedFootprintInBytes(): f64 {
    return <f64>(
      (offsetof<HistogramAdapter<T, U>>() +
        this._histogram.estimatedFootprintInBytes)
    );
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
  addPackedHistogram(otherHistogram: PackedHistogram): void {
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
  subtractPackedHistogram(otherHistogram: PackedHistogram): void {
    this._histogram.subtract(otherHistogram._histogram);
  }

  encode(): Uint8Array {
    return this._histogram.encode();
  }

  reset(): void {
    this._histogram.reset();
  }
}

export class Histogram8 extends HistogramAdapter<Uint8Storage, u8> {}
export class Histogram16 extends HistogramAdapter<Uint16Storage, u16> {}
export class Histogram32 extends HistogramAdapter<Uint32Storage, u32> {}
export class Histogram64 extends HistogramAdapter<Uint64Storage, u64> {}
export class PackedHistogram extends HistogramAdapter<PackedArray, u64> {}

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
): HistogramAdapter<Uint8Storage, u8> {
  return decodeHistogram<Uint8Storage, u8>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodeHistogram16(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint16Storage, u16> {
  return decodeHistogram<Uint16Storage, u16>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodeHistogram32(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint32Storage, u32> {
  return decodeHistogram<Uint32Storage, u32>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodeHistogram64(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<Uint64Storage, u64> {
  return decodeHistogram<Uint64Storage, u64>(
    data,
    minBarForHighestTrackableValue
  );
}
export function decodePackedHistogram(
  data: Uint8Array,
  minBarForHighestTrackableValue: f64
): HistogramAdapter<PackedArray, u64> {
  return decodeHistogram<PackedArray, u64>(
    data,
    minBarForHighestTrackableValue
  );
}
