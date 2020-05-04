import { BINARY } from "./generated-wasm";
const loader = require("@assemblyscript/loader");
const base64 = require("base64-js");

const isNode = typeof process !== "undefined" && process.version;
export const webAssemblyAvailable = (() => {
  let available = false;
  if (isNode) {
    // nodejs
    available = "WebAssembly" in global;
  } else {
    // browser
    // @ts-ignore
    available = "WebAssembly" in window;
  }
  return available;
})();

const wasm =
  webAssemblyAvailable && loader.instantiateSync(base64.toByteArray(BINARY));

interface WasmBuildRequest {
  /**
   * The size in bit of each count bucket
   * Default value is 32
   */
  bitBucketSize?: 8 | 16 | 32 | 64 | "packed";
  /**
   * Control whether or not the histogram can auto-resize and auto-adjust it's
   * highestTrackableValue
   * Default value is true
   */
  autoResize?: boolean;
  /**
   * The lowest value that can be discerned (distinguished from 0) by the histogram.
   * Must be a positive integer that is {@literal >=} 1. May be internally rounded
   * down to nearest power of 2.
   * Default value is 1
   */
  lowestDiscernibleValue?: number;
  /**
   * The highest value to be tracked by the histogram. Must be a positive
   * integer that is {@literal >=} (2 * lowestDiscernibleValue).
   * Default value is Number.MAX_SAFE_INTEGER
   */
  highestTrackableValue?: number;
  /**
   * The number of significant decimal digits to which the histogram will
   * maintain value resolution and separation. Must be a non-negative
   * integer between 0 and 5.
   * Default value is 3
   */
  numberOfSignificantValueDigits?: 1 | 2 | 3 | 4 | 5;
}

const defaultRequest: WasmBuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1,
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3
};

export class WasmHistogram {
  constructor(
    private _wasmHistogram: any,
    private _remoteHistogramClass: string
  ) {}

  static build(request: WasmBuildRequest = defaultRequest) {
    const parameters = Object.assign({}, defaultRequest, request);
    const remoteHistogramClass = `Histogram${parameters.bitBucketSize}`;
    return new WasmHistogram(
      new wasm[remoteHistogramClass](
        parameters.lowestDiscernibleValue,
        parameters.highestTrackableValue,
        parameters.numberOfSignificantValueDigits,
        parameters.autoResize
      ),
      remoteHistogramClass
    );
  }

  public get autoResize(): boolean {
    return !!this._wasmHistogram.autoResize;
  }

  public set autoResize(resize: boolean) {
    this._wasmHistogram.autoResize = resize;
  }

  public get highestTrackableValue(): number {
    return this._wasmHistogram.highestTrackableValue;
  }

  public set highestTrackableValue(value: number) {
    this._wasmHistogram.highestTrackableValue = value;
  }

  public get totalCount(): number {
    return this._wasmHistogram.totalCount;
  }
  public get stdDeviation(): number {
    return this._wasmHistogram.stdDeviation;
  }
  public get mean(): number {
    return this._wasmHistogram.mean;
  }
  public get estimatedFootprintInBytes(): number {
    return this._wasmHistogram.estimatedFootprintInBytes;
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
      wasm[this._remoteHistogramClass].wrap(
        this._wasmHistogram.copyCorrectedForCoordinatedOmission(
          expectedIntervalBetweenValueSamples
        )
      ),
      this._remoteHistogramClass
    );
  }

  add(otherHistogram: WasmHistogram): void {
    this._wasmHistogram[`add${otherHistogram._remoteHistogramClass}`](
      otherHistogram._wasmHistogram
    );
  }

  subtract(otherHistogram: WasmHistogram): void {
    this._wasmHistogram[`subtract${otherHistogram._remoteHistogramClass}`](
      otherHistogram._wasmHistogram
    );
  }

  reset(): void {
    this._wasmHistogram.reset();
  }

  destroy(): void {
    wasm.__release(this._wasmHistogram);
    this._wasmHistogram = null;
  }
}
