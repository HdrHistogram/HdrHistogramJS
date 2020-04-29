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

  getValueAtPercentile(percentile: number): number {
    return this._wasmHistogram.getValueAtPercentile(percentile);
  }

  outputPercentileDistribution(): string {
    return wasm.__getString(this._wasmHistogram.outputPercentileDistribution());
  }
}
