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
  private _histogram!: Histogram<T, U>;
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

  public get numberOfSignificantValueDigits(): f64 {
    return <f64>this._histogram.numberOfSignificantValueDigits;
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

  addWhileCorrectingForCoordinatedOmission(
    otherHistogram: HistogramAdapter<T, U>,
    expectedIntervalBetweenValueSamples: f64
  ): void {
    this._histogram.addWhileCorrectingForCoordinatedOmission(
      otherHistogram._histogram,
      <u64>expectedIntervalBetweenValueSamples
    );
  }
}

class Histogram8 extends HistogramAdapter<Uint8Storage, u8> {}
class Histogram16 extends HistogramAdapter<Uint16Storage, u16> {}
class Histogram32 extends HistogramAdapter<Uint32Storage, u32> {}
class Histogram64 extends HistogramAdapter<Uint64Storage, u64> {}
class PackedHistogram extends HistogramAdapter<PackedArray, u64> {}

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

// ---- Explicit exported wrapper functions (raw WebAssembly API) ----
// These replace the @assemblyscript/loader class-method proxies.
// Using Histogram32 as the concrete type for all generic get/set/method
// wrappers since it shares the same memory layout for fields accessed via f64.

export function newHistogram8(lowestDiscernibleValue: f64, highestTrackableValue: f64, numberOfSignificantValueDigits: f64, autoResize: boolean): Histogram8 {
  return new Histogram8(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, autoResize);
}
export function newHistogram16(lowestDiscernibleValue: f64, highestTrackableValue: f64, numberOfSignificantValueDigits: f64, autoResize: boolean): Histogram16 {
  return new Histogram16(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, autoResize);
}
export function newHistogram32(lowestDiscernibleValue: f64, highestTrackableValue: f64, numberOfSignificantValueDigits: f64, autoResize: boolean): Histogram32 {
  return new Histogram32(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, autoResize);
}
export function newHistogram64(lowestDiscernibleValue: f64, highestTrackableValue: f64, numberOfSignificantValueDigits: f64, autoResize: boolean): Histogram64 {
  return new Histogram64(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, autoResize);
}
export function newPackedHistogram(lowestDiscernibleValue: f64, highestTrackableValue: f64, numberOfSignificantValueDigits: f64, autoResize: boolean): PackedHistogram {
  return new PackedHistogram(lowestDiscernibleValue, highestTrackableValue, numberOfSignificantValueDigits, autoResize);
}

// Getters (per concrete type — generic params affect vtable dispatch in AS)
export function getNumberOfSignificantValueDigits8(h: Histogram8): f64 { return h.numberOfSignificantValueDigits; }
export function getNumberOfSignificantValueDigits16(h: Histogram16): f64 { return h.numberOfSignificantValueDigits; }
export function getNumberOfSignificantValueDigits32(h: Histogram32): f64 { return h.numberOfSignificantValueDigits; }
export function getNumberOfSignificantValueDigits64(h: Histogram64): f64 { return h.numberOfSignificantValueDigits; }
export function getNumberOfSignificantValueDigitsPacked(h: PackedHistogram): f64 { return h.numberOfSignificantValueDigits; }

export function getAutoResize8(h: Histogram8): boolean { return h.autoResize; }
export function getAutoResize16(h: Histogram16): boolean { return h.autoResize; }
export function getAutoResize32(h: Histogram32): boolean { return h.autoResize; }
export function getAutoResize64(h: Histogram64): boolean { return h.autoResize; }
export function getAutoResizePacked(h: PackedHistogram): boolean { return h.autoResize; }

export function getHighestTrackableValue8(h: Histogram8): f64 { return h.highestTrackableValue; }
export function getHighestTrackableValue16(h: Histogram16): f64 { return h.highestTrackableValue; }
export function getHighestTrackableValue32(h: Histogram32): f64 { return h.highestTrackableValue; }
export function getHighestTrackableValue64(h: Histogram64): f64 { return h.highestTrackableValue; }
export function getHighestTrackableValuePacked(h: PackedHistogram): f64 { return h.highestTrackableValue; }

export function getStartTimeStampMsec8(h: Histogram8): f64 { return h.startTimeStampMsec; }
export function getStartTimeStampMsec16(h: Histogram16): f64 { return h.startTimeStampMsec; }
export function getStartTimeStampMsec32(h: Histogram32): f64 { return h.startTimeStampMsec; }
export function getStartTimeStampMsec64(h: Histogram64): f64 { return h.startTimeStampMsec; }
export function getStartTimeStampMsecPacked(h: PackedHistogram): f64 { return h.startTimeStampMsec; }

export function getEndTimeStampMsec8(h: Histogram8): f64 { return h.endTimeStampMsec; }
export function getEndTimeStampMsec16(h: Histogram16): f64 { return h.endTimeStampMsec; }
export function getEndTimeStampMsec32(h: Histogram32): f64 { return h.endTimeStampMsec; }
export function getEndTimeStampMsec64(h: Histogram64): f64 { return h.endTimeStampMsec; }
export function getEndTimeStampMsecPacked(h: PackedHistogram): f64 { return h.endTimeStampMsec; }

export function getTotalCount8(h: Histogram8): f64 { return h.totalCount; }
export function getTotalCount16(h: Histogram16): f64 { return h.totalCount; }
export function getTotalCount32(h: Histogram32): f64 { return h.totalCount; }
export function getTotalCount64(h: Histogram64): f64 { return h.totalCount; }
export function getTotalCountPacked(h: PackedHistogram): f64 { return h.totalCount; }

export function getStdDeviation8(h: Histogram8): f64 { return h.stdDeviation; }
export function getStdDeviation16(h: Histogram16): f64 { return h.stdDeviation; }
export function getStdDeviation32(h: Histogram32): f64 { return h.stdDeviation; }
export function getStdDeviation64(h: Histogram64): f64 { return h.stdDeviation; }
export function getStdDeviationPacked(h: PackedHistogram): f64 { return h.stdDeviation; }

export function getMean8(h: Histogram8): f64 { return h.mean; }
export function getMean16(h: Histogram16): f64 { return h.mean; }
export function getMean32(h: Histogram32): f64 { return h.mean; }
export function getMean64(h: Histogram64): f64 { return h.mean; }
export function getMeanPacked(h: PackedHistogram): f64 { return h.mean; }

export function getEstimatedFootprintInBytes8(h: Histogram8): f64 { return h.estimatedFootprintInBytes; }
export function getEstimatedFootprintInBytes16(h: Histogram16): f64 { return h.estimatedFootprintInBytes; }
export function getEstimatedFootprintInBytes32(h: Histogram32): f64 { return h.estimatedFootprintInBytes; }
export function getEstimatedFootprintInBytes64(h: Histogram64): f64 { return h.estimatedFootprintInBytes; }
export function getEstimatedFootprintInBytesPacked(h: PackedHistogram): f64 { return h.estimatedFootprintInBytes; }

export function getMinNonZeroValue8(h: Histogram8): f64 { return h.minNonZeroValue; }
export function getMinNonZeroValue16(h: Histogram16): f64 { return h.minNonZeroValue; }
export function getMinNonZeroValue32(h: Histogram32): f64 { return h.minNonZeroValue; }
export function getMinNonZeroValue64(h: Histogram64): f64 { return h.minNonZeroValue; }
export function getMinNonZeroValuePacked(h: PackedHistogram): f64 { return h.minNonZeroValue; }

export function getMaxValue8(h: Histogram8): f64 { return h.maxValue; }
export function getMaxValue16(h: Histogram16): f64 { return h.maxValue; }
export function getMaxValue32(h: Histogram32): f64 { return h.maxValue; }
export function getMaxValue64(h: Histogram64): f64 { return h.maxValue; }
export function getMaxValuePacked(h: PackedHistogram): f64 { return h.maxValue; }

// Setters
export function setAutoResize8(h: Histogram8, resize: boolean): void { h.autoResize = resize; }
export function setAutoResize16(h: Histogram16, resize: boolean): void { h.autoResize = resize; }
export function setAutoResize32(h: Histogram32, resize: boolean): void { h.autoResize = resize; }
export function setAutoResize64(h: Histogram64, resize: boolean): void { h.autoResize = resize; }
export function setAutoResizePacked(h: PackedHistogram, resize: boolean): void { h.autoResize = resize; }

export function setHighestTrackableValue8(h: Histogram8, value: f64): void { h.highestTrackableValue = value; }
export function setHighestTrackableValue16(h: Histogram16, value: f64): void { h.highestTrackableValue = value; }
export function setHighestTrackableValue32(h: Histogram32, value: f64): void { h.highestTrackableValue = value; }
export function setHighestTrackableValue64(h: Histogram64, value: f64): void { h.highestTrackableValue = value; }
export function setHighestTrackableValuePacked(h: PackedHistogram, value: f64): void { h.highestTrackableValue = value; }

export function setStartTimeStampMsec8(h: Histogram8, value: f64): void { h.startTimeStampMsec = value; }
export function setStartTimeStampMsec16(h: Histogram16, value: f64): void { h.startTimeStampMsec = value; }
export function setStartTimeStampMsec32(h: Histogram32, value: f64): void { h.startTimeStampMsec = value; }
export function setStartTimeStampMsec64(h: Histogram64, value: f64): void { h.startTimeStampMsec = value; }
export function setStartTimeStampMsecPacked(h: PackedHistogram, value: f64): void { h.startTimeStampMsec = value; }

export function setEndTimeStampMsec8(h: Histogram8, value: f64): void { h.endTimeStampMsec = value; }
export function setEndTimeStampMsec16(h: Histogram16, value: f64): void { h.endTimeStampMsec = value; }
export function setEndTimeStampMsec32(h: Histogram32, value: f64): void { h.endTimeStampMsec = value; }
export function setEndTimeStampMsec64(h: Histogram64, value: f64): void { h.endTimeStampMsec = value; }
export function setEndTimeStampMsecPacked(h: PackedHistogram, value: f64): void { h.endTimeStampMsec = value; }

// Methods
export function recordValue8(h: Histogram8, value: f64): void { h.recordValue(value); }
export function recordValue16(h: Histogram16, value: f64): void { h.recordValue(value); }
export function recordValue32(h: Histogram32, value: f64): void { h.recordValue(value); }
export function recordValue64(h: Histogram64, value: f64): void { h.recordValue(value); }
export function recordValuePacked(h: PackedHistogram, value: f64): void { h.recordValue(value); }

export function recordValueWithCount8(h: Histogram8, value: f64, count: f64): void { h.recordValueWithCount(value, count); }
export function recordValueWithCount16(h: Histogram16, value: f64, count: f64): void { h.recordValueWithCount(value, count); }
export function recordValueWithCount32(h: Histogram32, value: f64, count: f64): void { h.recordValueWithCount(value, count); }
export function recordValueWithCount64(h: Histogram64, value: f64, count: f64): void { h.recordValueWithCount(value, count); }
export function recordValueWithCountPacked(h: PackedHistogram, value: f64, count: f64): void { h.recordValueWithCount(value, count); }

export function recordValueWithExpectedInterval8(h: Histogram8, value: f64, expectedIntervalBetweenValueSamples: f64): void { h.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples); }
export function recordValueWithExpectedInterval16(h: Histogram16, value: f64, expectedIntervalBetweenValueSamples: f64): void { h.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples); }
export function recordValueWithExpectedInterval32(h: Histogram32, value: f64, expectedIntervalBetweenValueSamples: f64): void { h.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples); }
export function recordValueWithExpectedInterval64(h: Histogram64, value: f64, expectedIntervalBetweenValueSamples: f64): void { h.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples); }
export function recordValueWithExpectedIntervalPacked(h: PackedHistogram, value: f64, expectedIntervalBetweenValueSamples: f64): void { h.recordValueWithExpectedInterval(value, expectedIntervalBetweenValueSamples); }

export function getValueAtPercentile8(h: Histogram8, percentile: f64): f64 { return h.getValueAtPercentile(percentile); }
export function getValueAtPercentile16(h: Histogram16, percentile: f64): f64 { return h.getValueAtPercentile(percentile); }
export function getValueAtPercentile32(h: Histogram32, percentile: f64): f64 { return h.getValueAtPercentile(percentile); }
export function getValueAtPercentile64(h: Histogram64, percentile: f64): f64 { return h.getValueAtPercentile(percentile); }
export function getValueAtPercentilePacked(h: PackedHistogram, percentile: f64): f64 { return h.getValueAtPercentile(percentile); }

export function outputPercentileDistribution8(h: Histogram8, percentileTicksPerHalfDistance: f64, outputValueUnitScalingRatio: f64): string { return h.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio); }
export function outputPercentileDistribution16(h: Histogram16, percentileTicksPerHalfDistance: f64, outputValueUnitScalingRatio: f64): string { return h.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio); }
export function outputPercentileDistribution32(h: Histogram32, percentileTicksPerHalfDistance: f64, outputValueUnitScalingRatio: f64): string { return h.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio); }
export function outputPercentileDistribution64(h: Histogram64, percentileTicksPerHalfDistance: f64, outputValueUnitScalingRatio: f64): string { return h.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio); }
export function outputPercentileDistributionPacked(h: PackedHistogram, percentileTicksPerHalfDistance: f64, outputValueUnitScalingRatio: f64): string { return h.outputPercentileDistribution(percentileTicksPerHalfDistance, outputValueUnitScalingRatio); }

export function encode8(h: Histogram8): Uint8Array { return h.encode(); }
export function encode16(h: Histogram16): Uint8Array { return h.encode(); }
export function encode32(h: Histogram32): Uint8Array { return h.encode(); }
export function encode64(h: Histogram64): Uint8Array { return h.encode(); }
export function encodePacked(h: PackedHistogram): Uint8Array { return h.encode(); }

export function reset8(h: Histogram8): void { h.reset(); }
export function reset16(h: Histogram16): void { h.reset(); }
export function reset32(h: Histogram32): void { h.reset(); }
export function reset64(h: Histogram64): void { h.reset(); }
export function resetPacked(h: PackedHistogram): void { h.reset(); }
export function copyCorrectedForCoordinatedOmission8(h: Histogram8, expectedIntervalBetweenValueSamples: f64): Histogram8 { return h.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) as Histogram8; }
export function copyCorrectedForCoordinatedOmission16(h: Histogram16, expectedIntervalBetweenValueSamples: f64): Histogram16 { return h.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) as Histogram16; }
export function copyCorrectedForCoordinatedOmission32(h: Histogram32, expectedIntervalBetweenValueSamples: f64): Histogram32 { return h.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) as Histogram32; }
export function copyCorrectedForCoordinatedOmission64(h: Histogram64, expectedIntervalBetweenValueSamples: f64): Histogram64 { return h.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) as Histogram64; }
export function copyCorrectedForCoordinatedOmissionPacked(h: PackedHistogram, expectedIntervalBetweenValueSamples: f64): PackedHistogram { return h.copyCorrectedForCoordinatedOmission(expectedIntervalBetweenValueSamples) as PackedHistogram; }

export function addHistogram8to8(h: Histogram8, other: Histogram8): void { h.addHistogram8(other); }
export function addHistogram16to8(h: Histogram8, other: Histogram16): void { h.addHistogram16(other); }
export function addHistogram32to8(h: Histogram8, other: Histogram32): void { h.addHistogram32(other); }
export function addHistogram64to8(h: Histogram8, other: Histogram64): void { h.addHistogram64(other); }
export function addPackedHistogramto8(h: Histogram8, other: PackedHistogram): void { h.addPackedHistogram(other); }
export function addHistogram8to16(h: Histogram16, other: Histogram8): void { h.addHistogram8(other); }
export function addHistogram16to16(h: Histogram16, other: Histogram16): void { h.addHistogram16(other); }
export function addHistogram32to16(h: Histogram16, other: Histogram32): void { h.addHistogram32(other); }
export function addHistogram64to16(h: Histogram16, other: Histogram64): void { h.addHistogram64(other); }
export function addPackedHistogramto16(h: Histogram16, other: PackedHistogram): void { h.addPackedHistogram(other); }
export function addHistogram8to32(h: Histogram32, other: Histogram8): void { h.addHistogram8(other); }
export function addHistogram16to32(h: Histogram32, other: Histogram16): void { h.addHistogram16(other); }
export function addHistogram32to32(h: Histogram32, other: Histogram32): void { h.addHistogram32(other); }
export function addHistogram64to32(h: Histogram32, other: Histogram64): void { h.addHistogram64(other); }
export function addPackedHistogramto32(h: Histogram32, other: PackedHistogram): void { h.addPackedHistogram(other); }
export function addHistogram8to64(h: Histogram64, other: Histogram8): void { h.addHistogram8(other); }
export function addHistogram16to64(h: Histogram64, other: Histogram16): void { h.addHistogram16(other); }
export function addHistogram32to64(h: Histogram64, other: Histogram32): void { h.addHistogram32(other); }
export function addHistogram64to64(h: Histogram64, other: Histogram64): void { h.addHistogram64(other); }
export function addPackedHistogramto64(h: Histogram64, other: PackedHistogram): void { h.addPackedHistogram(other); }
export function addHistogram8toPacked(h: PackedHistogram, other: Histogram8): void { h.addHistogram8(other); }
export function addHistogram16toPacked(h: PackedHistogram, other: Histogram16): void { h.addHistogram16(other); }
export function addHistogram32toPacked(h: PackedHistogram, other: Histogram32): void { h.addHistogram32(other); }
export function addHistogram64toPacked(h: PackedHistogram, other: Histogram64): void { h.addHistogram64(other); }
export function addPackedHistogramtoPacked(h: PackedHistogram, other: PackedHistogram): void { h.addPackedHistogram(other); }

export function subtractHistogram8from8(h: Histogram8, other: Histogram8): void { h.subtractHistogram8(other); }
export function subtractHistogram16from8(h: Histogram8, other: Histogram16): void { h.subtractHistogram16(other); }
export function subtractHistogram32from8(h: Histogram8, other: Histogram32): void { h.subtractHistogram32(other); }
export function subtractHistogram64from8(h: Histogram8, other: Histogram64): void { h.subtractHistogram64(other); }
export function subtractPackedHistogramfrom8(h: Histogram8, other: PackedHistogram): void { h.subtractPackedHistogram(other); }
export function subtractHistogram8from16(h: Histogram16, other: Histogram8): void { h.subtractHistogram8(other); }
export function subtractHistogram16from16(h: Histogram16, other: Histogram16): void { h.subtractHistogram16(other); }
export function subtractHistogram32from16(h: Histogram16, other: Histogram32): void { h.subtractHistogram32(other); }
export function subtractHistogram64from16(h: Histogram16, other: Histogram64): void { h.subtractHistogram64(other); }
export function subtractPackedHistogramfrom16(h: Histogram16, other: PackedHistogram): void { h.subtractPackedHistogram(other); }
export function subtractHistogram8from32(h: Histogram32, other: Histogram8): void { h.subtractHistogram8(other); }
export function subtractHistogram16from32(h: Histogram32, other: Histogram16): void { h.subtractHistogram16(other); }
export function subtractHistogram32from32(h: Histogram32, other: Histogram32): void { h.subtractHistogram32(other); }
export function subtractHistogram64from32(h: Histogram32, other: Histogram64): void { h.subtractHistogram64(other); }
export function subtractPackedHistogramfrom32(h: Histogram32, other: PackedHistogram): void { h.subtractPackedHistogram(other); }
export function subtractHistogram8from64(h: Histogram64, other: Histogram8): void { h.subtractHistogram8(other); }
export function subtractHistogram16from64(h: Histogram64, other: Histogram16): void { h.subtractHistogram16(other); }
export function subtractHistogram32from64(h: Histogram64, other: Histogram32): void { h.subtractHistogram32(other); }
export function subtractHistogram64from64(h: Histogram64, other: Histogram64): void { h.subtractHistogram64(other); }
export function subtractPackedHistogramfrom64(h: Histogram64, other: PackedHistogram): void { h.subtractPackedHistogram(other); }
export function subtractHistogram8fromPacked(h: PackedHistogram, other: Histogram8): void { h.subtractHistogram8(other); }
export function subtractHistogram16fromPacked(h: PackedHistogram, other: Histogram16): void { h.subtractHistogram16(other); }
export function subtractHistogram32fromPacked(h: PackedHistogram, other: Histogram32): void { h.subtractHistogram32(other); }
export function subtractHistogram64fromPacked(h: PackedHistogram, other: Histogram64): void { h.subtractHistogram64(other); }
export function subtractPackedHistogramfromPacked(h: PackedHistogram, other: PackedHistogram): void { h.subtractPackedHistogram(other); }

export function addWhileCorrectingForCoordinatedOmission8(h: Histogram8, other: Histogram8, expectedIntervalBetweenValueSamples: f64): void { h.addWhileCorrectingForCoordinatedOmission(other, expectedIntervalBetweenValueSamples); }
export function addWhileCorrectingForCoordinatedOmission16(h: Histogram16, other: Histogram16, expectedIntervalBetweenValueSamples: f64): void { h.addWhileCorrectingForCoordinatedOmission(other, expectedIntervalBetweenValueSamples); }
export function addWhileCorrectingForCoordinatedOmission32(h: Histogram32, other: Histogram32, expectedIntervalBetweenValueSamples: f64): void { h.addWhileCorrectingForCoordinatedOmission(other, expectedIntervalBetweenValueSamples); }
export function addWhileCorrectingForCoordinatedOmission64(h: Histogram64, other: Histogram64, expectedIntervalBetweenValueSamples: f64): void { h.addWhileCorrectingForCoordinatedOmission(other, expectedIntervalBetweenValueSamples); }
export function addWhileCorrectingForCoordinatedOmissionPacked(h: PackedHistogram, other: PackedHistogram, expectedIntervalBetweenValueSamples: f64): void { h.addWhileCorrectingForCoordinatedOmission(other, expectedIntervalBetweenValueSamples); }
