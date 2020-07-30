import { BINARY } from "./generated-wasm";
import Histogram, {
  NO_TAG,
  BitBucketSize,
  toSummary,
  HistogramSummary
} from "../Histogram";
// @ts-ignore
import * as base64 from "base64-js";
// @ts-ignore
import * as pako from "pako";
// @ts-ignore
import * as loader from "@assemblyscript/loader";
import { BuildRequest } from "../HistogramBuilder";

const isNode = typeof process !== "undefined" && process.version;
// @ts-ignore
const isWorker = typeof importScripts === "function";
export const webAssemblyAvailable = (() => {
  let available = false;
  if (isNode) {
    // nodejs
    available = "WebAssembly" in global;
  } else {
    // browser
    // @ts-ignore
    available = isWorker || "WebAssembly" in window;
  }
  return available;
})();

let wasm: any = undefined;

export const initWebAssembly = async (): Promise<void> => {
  if (!webAssemblyAvailable) {
    throw new Error("WebAssembly not available here!");
  }
  if (!!wasm) {
    return;
  }
  return loader
    .instantiate(pako.inflate(base64.toByteArray(BINARY)))
    .then((w: any) => (wasm = w.exports || w));
};

export const initWebAssemblySync = () => {
  if (!!wasm) {
    return;
  }
  const w = loader.instantiateSync(pako.inflate(base64.toByteArray(BINARY)));
  wasm = w.exports || w;
};

export const webAssemblyReady = () => !!wasm;

const defaultRequest: BuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1,
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3
};

const remoteHistogramClassFor = (size?: BitBucketSize) =>
  size === "packed" ? "PackedHistogram" : `Histogram${size}`;

const destroyedWasmHistogram = new Proxy(
  {},
  {
    get: function(obj, prop) {
      throw new Error("Cannot use a destroyed histogram");
    }
  }
);

export class WasmHistogram implements Histogram {
  tag: string;

  constructor(
    private _wasmHistogram: any,
    private _remoteHistogramClass: string
  ) {
    this.tag = NO_TAG;
  }

  static build(request: BuildRequest = defaultRequest) {
    if (!webAssemblyReady()) {
      throw new Error("WebAssembly is not ready yet!");
    }
    const parameters = Object.assign({}, defaultRequest, request);
    const remoteHistogramClass = remoteHistogramClassFor(
      parameters.bitBucketSize
    );
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

  static decode(
    data: Uint8Array,
    bitBucketSize: 8 | 16 | 32 | 64 | "packed" = 32,
    minBarForHighestTrackableValue: number = 0
  ): Histogram {
    if (!webAssemblyReady()) {
      throw new Error("WebAssembly is not ready yet!");
    }
    const remoteHistogramClass = remoteHistogramClassFor(bitBucketSize);
    const decodeFunc = `decode${remoteHistogramClass}`;
    const ptrArr = wasm.__retain(wasm.__allocArray(wasm.UINT8ARRAY_ID, data));
    const wasmHistogram = new WasmHistogram(
      wasm[remoteHistogramClass].wrap(
        wasm[decodeFunc](ptrArr, minBarForHighestTrackableValue)
      ),
      remoteHistogramClass
    );
    wasm.__release(ptrArr);
    return wasmHistogram;
  }

  public get numberOfSignificantValueDigits(): number {
    return this._wasmHistogram.numberOfSignificantValueDigits;
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

  public get startTimeStampMsec(): number {
    return this._wasmHistogram.startTimeStampMsec;
  }

  public set startTimeStampMsec(value: number) {
    this._wasmHistogram.startTimeStampMsec = value;
  }

  public get endTimeStampMsec(): number {
    return this._wasmHistogram.endTimeStampMsec;
  }

  public set endTimeStampMsec(value: number) {
    this._wasmHistogram.endTimeStampMsec = value;
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
    return 192 + this._wasmHistogram.estimatedFootprintInBytes;
  }

  public get minNonZeroValue(): number {
    return this._wasmHistogram.minNonZeroValue;
  }
  public get maxValue(): number {
    return this._wasmHistogram.maxValue;
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
    if (useCsvFormat) {
      throw new Error("CSV output not supported by wasm histograms");
    }
    return wasm.__getString(
      this._wasmHistogram.outputPercentileDistribution(
        percentileTicksPerHalfDistance,
        outputValueUnitScalingRatio
      )
    );
  }

  private isDestroyed() {
    return this._wasmHistogram === destroyedWasmHistogram;
  }

  get summary(): HistogramSummary {
    return toSummary(this);
  }

  toJSON(): HistogramSummary {
    return this.summary;
  }

  toString() {
    if (this.isDestroyed()) {
      return "Destroyed WASM histogram";
    }
    return `WASM ${this._remoteHistogramClass} ${JSON.stringify(
      this,
      null,
      2
    )}`;
  }

  inspect() {
    return this.toString();
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toString();
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
    if (!(otherHistogram instanceof WasmHistogram)) {
      // should be impossible to be in this situation but actually
      // TypeScript has some flaws...
      throw new Error("Cannot add a regular JS histogram to a WASM histogram");
    }
    this._wasmHistogram[`add${otherHistogram._remoteHistogramClass}`](
      otherHistogram._wasmHistogram
    );
  }

  subtract(otherHistogram: WasmHistogram): void {
    if (!(otherHistogram instanceof WasmHistogram)) {
      // should be impossible to be in this situation but actually
      // TypeScript has some flaws...
      throw new Error(
        "Cannot subtract a regular JS histogram to a WASM histogram"
      );
    }
    this._wasmHistogram[`subtract${otherHistogram._remoteHistogramClass}`](
      otherHistogram._wasmHistogram
    );
  }

  encode(): Uint8Array {
    const ptrArray = this._wasmHistogram.encode();
    const array = wasm.__getUint8Array(ptrArray);
    wasm.__release(ptrArray);
    return array;
  }

  reset(): void {
    this.tag = NO_TAG;
    this._wasmHistogram.reset();
  }

  destroy(): void {
    wasm.__release(this._wasmHistogram);
    this._wasmHistogram = destroyedWasmHistogram;
  }
}
