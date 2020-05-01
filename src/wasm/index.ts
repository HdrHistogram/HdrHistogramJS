import { BINARY } from "./generated-wasm";
const loader = require("@assemblyscript/loader");
const base64 = require("base64-js");

const wasm = loader.instantiateSync(base64.toByteArray(BINARY));

export class WasmHistogram {
  constructor(private _wasmHistogram: any) {}

  static create(
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number,
    bitBucketSize: 8 | 16 | 32 | 64 | "packed",
    autoResize: boolean = true
  ) {
    return new WasmHistogram(
      new wasm[`Histogram${bitBucketSize}`](
        lowestDiscernibleValue,
        highestTrackableValue,
        numberOfSignificantValueDigits,
        autoResize
      )
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
    this._wasmHistogram.addWhileCorrectingForCoordinatedOmission(
      otherHistogram,
      expectedIntervalBetweenValueSamples
    );
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ): WasmHistogram {
    return new WasmHistogram(
      wasm[`Histogram32`].wrap(
        this._wasmHistogram.copyCorrectedForCoordinatedOmission(
          expectedIntervalBetweenValueSamples
        )
      )
    );
  }

  add(otherHistogram: WasmHistogram): void {
    throw "not implemented";
  }

  subtract(otherHistogram: WasmHistogram): void {
    throw "not implemented";
  }

  reset(): void {
    this._wasmHistogram.reset();
  }

  destroy(): void {
    wasm.__release(this._wasmHistogram);
    this._wasmHistogram = null;
  }

  getEstimatedFootprintInBytes(): number {
    throw "not implemented";
  }
}
