// The entry file of your WebAssembly module.
import Histogram from "./Histogram";

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export class Toto {
  constructor(public titi: f64) {}

  do(): f64 {
    return this.titi * this.titi;
  }
}

class HistogramAdapter<T, U> {
  private _histogram: Histogram<T, U>;
  constructor(
    lowestDiscernibleValue: f64,
    highestTrackableValue: f64,
    numberOfSignificantValueDigits: f64
  ) {
    this._histogram = new Histogram<T, U>(
      <u64>lowestDiscernibleValue,
      <u64>highestTrackableValue,
      <u8>numberOfSignificantValueDigits
    );
    this._histogram.autoResize = true;
  }

  recordValue(value: f64): void {
    this._histogram.recordSingleValue(<u64>value);
  }
  getValueAtPercentile(percentile: f64): f64 {
    return <f64>this._histogram.getValueAtPercentile(percentile);
  }
}

export class Histogram8 extends HistogramAdapter<Uint8Array, u8> {}
export class Histogram16 extends HistogramAdapter<Uint16Array, u16> {}
export class Histogram32 extends HistogramAdapter<Uint32Array, u32> {}
export class Histogram64 extends HistogramAdapter<Uint64Array, u64> {}
