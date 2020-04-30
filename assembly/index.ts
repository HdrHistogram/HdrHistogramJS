import Histogram from "./Histogram";

class HistogramAdapter<T, U> {
  private _histogram: Histogram<T, U>;
  constructor(
    lowestDiscernibleValue: f64,
    highestTrackableValue: f64,
    numberOfSignificantValueDigits: f64,
    autoResize: boolean
  ) {
    this._histogram = new Histogram<T, U>(
      <u64>lowestDiscernibleValue,
      <u64>highestTrackableValue,
      <u8>numberOfSignificantValueDigits
    );
    this._histogram.autoResize = autoResize;
  }

  recordValue(value: f64): void {
    this._histogram.recordSingleValue(<u64>value);
  }

  recordValueWithCount(value: f64, count: f64): void {
    //this._histogram.recordValueWithCount(<u64>value);
  }

  getValueAtPercentile(percentile: f64): f64 {
    return <f64>this._histogram.getValueAtPercentile(percentile);
  }

  getStdDeviation(): f64 {
    return this._histogram.getStdDeviation();
  }
  getMean(): f64 {
    return this._histogram.getMean();
  }
  getTotalCount(): f64 {
    return this._histogram.totalCount;
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
}

export class Histogram8 extends HistogramAdapter<Uint8Array, u8> {}
export class Histogram16 extends HistogramAdapter<Uint16Array, u16> {}
export class Histogram32 extends HistogramAdapter<Uint32Array, u32> {}
export class Histogram64 extends HistogramAdapter<Uint64Array, u64> {}
