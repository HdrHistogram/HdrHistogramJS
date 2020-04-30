import { BINARY } from "./generated-wasm";
const loader = require("@assemblyscript/loader");
const base64 = require("base64-js");

const wasm = loader.instantiateSync(base64.toByteArray(BINARY));

export class WasmHistogram {
  private _wasmHistogram: any;
  constructor(
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number,
    bitBucketSize: 8 | 16 | 32 | 64 | "packed",
    autoResize: boolean = true
  ) {
    this._wasmHistogram = new wasm[`Histogram${bitBucketSize}`](
      lowestDiscernibleValue,
      highestTrackableValue,
      numberOfSignificantValueDigits,
      autoResize
    );
  }

  recordValue(value: number) {
    this._wasmHistogram.recordValue(value);
  }

  recordValueWithCount(value: number, count: number): void {
    this._wasmHistogram.recordValueWithCount(value, count);
  }

  recordValueWithExpectedInterval(
    value: number,
    expectedIntervalBetweenValueSamples: number
  ) {
    this._wasmHistogram.recordValueWithExpectedInterval(
      value,
      expectedIntervalBetweenValueSamples
    );
  }

  getValueAtPercentile(percentile: number): number {
    return this._wasmHistogram.getValueAtPercentile(percentile);
  }

  getStdDeviation(): number {
    return this._wasmHistogram.getStdDeviation();
  }
  getMean(): number {
    return this._wasmHistogram.getMean();
  }
  getTotalCount(): number {
    return this._wasmHistogram.getTotalCount();
  }

  outputPercentileDistribution(
    percentileTicksPerHalfDistance = 5,
    outputValueUnitScalingRatio = 1,
    useCsvFormat = false
  ): string {
    // TODO csv
    return wasm.__getString(
      this._wasmHistogram.outputPercentileDistribution(
        percentileTicksPerHalfDistance,
        outputValueUnitScalingRatio
      )
    );
  }

  addWhileCorrectingForCoordinatedOmission(
    otherHistogram: WasmHistogram,
    expectedIntervalBetweenValueSamples: number
  ): void {
    throw "not implemented";
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ): WasmHistogram {
    throw "not implemented";
  }

  add(otherHistogram: WasmHistogram): void {
    throw "not implemented";
  }

  subtract(otherHistogram: WasmHistogram): void {
    throw "not implemented";
  }

  reset(): void {
    throw "not implemented";
  }

  destroy(): void {
    throw "not implemented";
  }

  getEstimatedFootprintInBytes(): number {
    throw "not implemented";
  }
}
