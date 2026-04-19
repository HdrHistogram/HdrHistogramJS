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

// Cached at first decode call to avoid re-reading a getter on every array creation
let cachedUint8ArrayId: number = 0;

// Per-suffix function tables — built once per histogram type, shared by all instances.
// Avoids the 25+ property lookups that would otherwise happen in every constructor.
interface WasmFns {
  getNumberOfSignificantValueDigits: (ptr: number) => number;
  getAutoResize: (ptr: number) => number;
  setAutoResize: (ptr: number, value: number) => void;
  getHighestTrackableValue: (ptr: number) => number;
  setHighestTrackableValue: (ptr: number, value: number) => void;
  getStartTimeStampMsec: (ptr: number) => number;
  setStartTimeStampMsec: (ptr: number, value: number) => void;
  getEndTimeStampMsec: (ptr: number) => number;
  setEndTimeStampMsec: (ptr: number, value: number) => void;
  getTotalCount: (ptr: number) => number;
  getStdDeviation: (ptr: number) => number;
  getMean: (ptr: number) => number;
  getEstimatedFootprintInBytes: (ptr: number) => number;
  getMinNonZeroValue: (ptr: number) => number;
  getMaxValue: (ptr: number) => number;
  recordValue: (ptr: number, value: number) => void;
  recordValueWithCount: (ptr: number, value: number, count: number) => void;
  recordValueWithExpectedInterval: (
    ptr: number,
    value: number,
    expectedInterval: number
  ) => void;
  getValueAtPercentile: (ptr: number, percentile: number) => number;
  outputPercentileDistribution: (
    ptr: number,
    ticksPerHalfDistance: number,
    scalingRatio: number
  ) => number;
  encode: (ptr: number) => number;
  reset: (ptr: number) => void;
  addWhileCorrectingForCoordinatedOmission: (
    ptr: number,
    other: number,
    expectedInterval: number
  ) => void;
  copyCorrectedForCoordinatedOmission: (
    ptr: number,
    expectedInterval: number
  ) => number;
}

const wasmFnCache = new Map<string, WasmFns>();

// Periodic GC for --runtime minimal (tcms): collect every N destroys to bound heap growth.
let destroyCount = 0;
const COLLECT_INTERVAL = 1;

function buildWasmFns(s: string): WasmFns {
  return {
    getNumberOfSignificantValueDigits: wasm[`getNumberOfSignificantValueDigits${s}`],
    getAutoResize: wasm[`getAutoResize${s}`],
    setAutoResize: wasm[`setAutoResize${s}`],
    getHighestTrackableValue: wasm[`getHighestTrackableValue${s}`],
    setHighestTrackableValue: wasm[`setHighestTrackableValue${s}`],
    getStartTimeStampMsec: wasm[`getStartTimeStampMsec${s}`],
    setStartTimeStampMsec: wasm[`setStartTimeStampMsec${s}`],
    getEndTimeStampMsec: wasm[`getEndTimeStampMsec${s}`],
    setEndTimeStampMsec: wasm[`setEndTimeStampMsec${s}`],
    getTotalCount: wasm[`getTotalCount${s}`],
    getStdDeviation: wasm[`getStdDeviation${s}`],
    getMean: wasm[`getMean${s}`],
    getEstimatedFootprintInBytes: wasm[`getEstimatedFootprintInBytes${s}`],
    getMinNonZeroValue: wasm[`getMinNonZeroValue${s}`],
    getMaxValue: wasm[`getMaxValue${s}`],
    recordValue: wasm[`recordValue${s}`],
    recordValueWithCount: wasm[`recordValueWithCount${s}`],
    recordValueWithExpectedInterval: wasm[`recordValueWithExpectedInterval${s}`],
    getValueAtPercentile: wasm[`getValueAtPercentile${s}`],
    outputPercentileDistribution: wasm[`outputPercentileDistribution${s}`],
    encode: wasm[`encode${s}`],
    reset: wasm[`reset${s}`],
    addWhileCorrectingForCoordinatedOmission: wasm[`addWhileCorrectingForCoordinatedOmission${s}`],
    copyCorrectedForCoordinatedOmission: wasm[`copyCorrectedForCoordinatedOmission${s}`],
  };
}

function getWasmFns(suffix: string): WasmFns {
  let fns = wasmFnCache.get(suffix);
  if (!fns) {
    fns = buildWasmFns(suffix);
    wasmFnCache.set(suffix, fns);
  }
  return fns;
}

const wasmImports = {
  env: {
    abort(
      messagePtr: number,
      fileNamePtr: number,
      lineNumber: number,
      columnNumber: number
    ) {
      throw new Error(
        `Abort in WebAssembly at ${lineNumber}:${columnNumber}`
      );
    }
  }
};

// @ts-ignore
const WA: any = typeof WebAssembly !== "undefined" ? WebAssembly : undefined;

export const initWebAssembly = async (): Promise<void> => {
  if (!webAssemblyAvailable) {
    throw new Error("WebAssembly not available here!");
  }
  if (wasm) return;
  const binary = pako.inflate(base64.toByteArray(BINARY));
  const { instance } = await WA.instantiate(binary, wasmImports);
  wasm = instance.exports;
};

export const initWebAssemblySync = () => {
  if (wasm) return;
  const binary = pako.inflate(base64.toByteArray(BINARY));
  const module = new WA.Module(binary);
  const instance = new WA.Instance(module, wasmImports);
  wasm = instance.exports;
};

export const webAssemblyReady = () => !!wasm;

/** Read a UTF-16LE string from WASM linear memory */
function getString(ptr: number): string {
  if (!ptr) return "";
  const mem = wasm.memory.buffer;
  const lenBytes = new Uint32Array(mem)[(ptr - 4) >>> 2];
  const chars = new Uint16Array(mem, ptr, lenBytes >>> 1);
  let result = "";
  for (let i = 0; i < chars.length; i += 1024) {
    result += String.fromCharCode(
      ...(Array.from(
        chars.subarray(i, Math.min(i + 1024, chars.length))
      ) as number[])
    );
  }
  return result;
}

/** Copy a Uint8Array out of WASM linear memory (ArrayBufferView layout) */
function getUint8Array(ptr: number): Uint8Array {
  const U32 = new Uint32Array(wasm.memory.buffer);
  const dataStart = U32[(ptr + 4) >>> 2];
  const byteLength = U32[(ptr + 8) >>> 2];
  return new Uint8Array(wasm.memory.buffer, dataStart, byteLength).slice();
}

/**
 * Copies a JS Uint8Array into WASM memory and returns a WASM Uint8Array pointer.
 * Bypasses the RTTI table (AS 0.27 has an 8-byte stride that the old loader
 * reads wrong at 4 bytes).
 */
function newUint8Array(data: Uint8Array): number {
  if (!cachedUint8ArrayId) {
    cachedUint8ArrayId =
      typeof wasm.UINT8ARRAY_ID === "number"
        ? wasm.UINT8ARRAY_ID
        : (wasm.UINT8ARRAY_ID as any).value;
  }
  const length = data.length;
  // Allocate underlying ArrayBuffer (id=1) and pin it during construction
  const bufPtr = wasm.__pin(wasm.__new(length, 1));
  new Uint8Array(wasm.memory.buffer).set(data, bufPtr);
  // Allocate the Uint8Array view (12-byte ArrayBufferView struct) and pin it
  // so it stays alive through the GC cycles triggered by the decode allocation storm.
  const viewPtr = wasm.__pin(wasm.__new(12, cachedUint8ArrayId));
  const U32 = new Uint32Array(wasm.memory.buffer);
  U32[viewPtr >>> 2] = bufPtr; // buffer ref
  U32[(viewPtr + 4) >>> 2] = bufPtr; // dataStart
  U32[(viewPtr + 8) >>> 2] = length; // byteLength
  wasm.__unpin(bufPtr);
  return viewPtr;
}

const defaultRequest: BuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1,
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3
};

const remoteHistogramClassFor = (size?: BitBucketSize) =>
  size === "packed" ? "PackedHistogram" : `Histogram${size}`;

/** Map class name to the suffix used in the exported WASM function names */
function suffixFor(remoteHistogramClass: string): string {
  if (remoteHistogramClass === "PackedHistogram") return "Packed";
  // "Histogram8" → "8", "Histogram32" → "32", etc.
  return remoteHistogramClass.replace("Histogram", "");
}

export class WasmHistogram implements Histogram {
  tag: string;
  private _ptr: number;
  private _suffix: string;
  private _fns: WasmFns;

  constructor(wasmPtr: number, private _remoteHistogramClass: string) {
    this.tag = NO_TAG;
    this._suffix = suffixFor(_remoteHistogramClass);
    this._fns = getWasmFns(this._suffix);
    this._ptr = wasm.__pin(wasmPtr);
  }

  static build(request: BuildRequest = defaultRequest) {
    if (!webAssemblyReady()) {
      throw new Error("WebAssembly is not ready yet!");
    }
    const parameters = Object.assign({}, defaultRequest, request);
    const remoteHistogramClass = remoteHistogramClassFor(
      parameters.bitBucketSize
    );
    const suffix = suffixFor(remoteHistogramClass);
    // constructor function name: "newHistogram8"…"newHistogram64" or "newPackedHistogram"
    const newFuncName =
      suffix === "Packed" ? "newPackedHistogram" : `newHistogram${suffix}`;
    const ptr: number = wasm[newFuncName](
      parameters.lowestDiscernibleValue,
      parameters.highestTrackableValue,
      parameters.numberOfSignificantValueDigits,
      parameters.autoResize ? 1 : 0
    );
    return new WasmHistogram(ptr, remoteHistogramClass);
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
    const suffix = suffixFor(remoteHistogramClass);
    const ptrArr = newUint8Array(data); // pinned — must unpin after use
    // decode function name: "decodeHistogram8"…"decodeHistogram64" or "decodePackedHistogram"
    const decodeFuncName =
      suffix === "Packed"
        ? "decodePackedHistogram"
        : `decodeHistogram${suffix}`;
    const ptr: number = wasm[decodeFuncName](
      ptrArr,
      minBarForHighestTrackableValue
    );
    wasm.__unpin(ptrArr);
    return new WasmHistogram(ptr, remoteHistogramClass);
  }

  public get numberOfSignificantValueDigits(): number {
    return this._fns.getNumberOfSignificantValueDigits(this._ptr);
  }

  public get autoResize(): boolean {
    return this._fns.getAutoResize(this._ptr) !== 0;
  }

  public set autoResize(resize: boolean) {
    this._fns.setAutoResize(this._ptr, resize ? 1 : 0);
  }

  public get highestTrackableValue(): number {
    return this._fns.getHighestTrackableValue(this._ptr);
  }

  public set highestTrackableValue(value: number) {
    this._fns.setHighestTrackableValue(this._ptr, value);
  }

  public get startTimeStampMsec(): number {
    return this._fns.getStartTimeStampMsec(this._ptr);
  }

  public set startTimeStampMsec(value: number) {
    this._fns.setStartTimeStampMsec(this._ptr, value);
  }

  public get endTimeStampMsec(): number {
    return this._fns.getEndTimeStampMsec(this._ptr);
  }

  public set endTimeStampMsec(value: number) {
    this._fns.setEndTimeStampMsec(this._ptr, value);
  }

  public get totalCount(): number {
    return this._fns.getTotalCount(this._ptr);
  }

  public get stdDeviation(): number {
    return this._fns.getStdDeviation(this._ptr);
  }

  public get mean(): number {
    return this._fns.getMean(this._ptr);
  }

  public get estimatedFootprintInBytes(): number {
    return 192 + this._fns.getEstimatedFootprintInBytes(this._ptr);
  }

  public get minNonZeroValue(): number {
    return this._fns.getMinNonZeroValue(this._ptr);
  }

  public get maxValue(): number {
    return this._fns.getMaxValue(this._ptr);
  }

  recordValue(value: number) {
    if (this._ptr === 0) throw new Error("Cannot use a destroyed histogram");
    this._fns.recordValue(this._ptr, value);
  }

  recordValueWithCount(value: number, count: number): void {
    this._fns.recordValueWithCount(this._ptr, value, count);
  }

  recordValueWithExpectedInterval(
    value: number,
    expectedIntervalBetweenValueSamples: number
  ) {
    this._fns.recordValueWithExpectedInterval(
      this._ptr,
      value,
      expectedIntervalBetweenValueSamples
    );
  }

  getValueAtPercentile(percentile: number): number {
    return this._fns.getValueAtPercentile(this._ptr, percentile);
  }

  outputPercentileDistribution(
    percentileTicksPerHalfDistance = 5,
    outputValueUnitScalingRatio = 1,
    useCsvFormat = false
  ): string {
    if (useCsvFormat) {
      throw new Error("CSV output not supported by wasm histograms");
    }
    const strPtr: number = this._fns.outputPercentileDistribution(
      this._ptr,
      percentileTicksPerHalfDistance,
      outputValueUnitScalingRatio
    );
    return getString(strPtr);
  }

  private isDestroyed() {
    return this._ptr === 0;
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
    this._fns.addWhileCorrectingForCoordinatedOmission(
      this._ptr,
      otherHistogram._ptr,
      expectedIntervalBetweenValueSamples
    );
  }

  copyCorrectedForCoordinatedOmission(
    expectedIntervalBetweenValueSamples: number
  ): WasmHistogram {
    const resultPtr: number = this._fns.copyCorrectedForCoordinatedOmission(
      this._ptr,
      expectedIntervalBetweenValueSamples
    );
    return new WasmHistogram(resultPtr, this._remoteHistogramClass);
  }

  add(otherHistogram: WasmHistogram): void {
    if (!(otherHistogram instanceof WasmHistogram)) {
      throw new Error(
        "Cannot add a regular JS histogram to a WASM histogram"
      );
    }
    wasm[`addHistogram${otherHistogram._suffix}to${this._suffix}`](
      this._ptr,
      otherHistogram._ptr
    );
  }

  subtract(otherHistogram: WasmHistogram): void {
    if (!(otherHistogram instanceof WasmHistogram)) {
      throw new Error(
        "Cannot subtract a regular JS histogram to a WASM histogram"
      );
    }
    wasm[`subtractHistogram${otherHistogram._suffix}from${this._suffix}`](
      this._ptr,
      otherHistogram._ptr
    );
  }

  encode(): Uint8Array {
    const arrPtr: number = wasm.__pin(this._fns.encode(this._ptr));
    const result = getUint8Array(arrPtr);
    wasm.__unpin(arrPtr);
    return result;
  }

  reset(): void {
    this.tag = NO_TAG;
    this._fns.reset(this._ptr);
  }

  destroy(): void {
    wasm.__unpin(this._ptr);
    this._ptr = 0;
    if (++destroyCount >= COLLECT_INTERVAL) {
      destroyCount = 0;
      wasm.__collect();
    }
  }
}
