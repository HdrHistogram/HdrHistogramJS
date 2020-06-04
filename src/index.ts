/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import AbstractHistogram from "./JsHistogram";
import ByteBuffer from "./ByteBuffer";
import {
  decodeFromCompressedBase64,
  encodeIntoCompressedBase64,
} from "./encoding";
import Float64Histogram from "./Float64Histogram";
import Histogram, {
  BitBucketSize,
  BuildRequest as HistogramBuildRequest,
} from "./Histogram";
import HistogramLogReader, { listTags } from "./HistogramLogReader";
import HistogramLogWriter from "./HistogramLogWriter";
import Int16Histogram from "./Int16Histogram";
import Int32Histogram from "./Int32Histogram";
import Int8Histogram from "./Int8Histogram";
import { constructorFromBucketSize } from "./JsHistogramFactory";
import PackedHistogram from "./PackedHistogram";
import Recorder from "./Recorder";
import {
  initWebAssembly,
  WasmHistogram,
  webAssemblyAvailable,
  webAssemblyReady,
} from "./wasm";

interface BuildRequest extends HistogramBuildRequest {
  /**
   * Is WebAssembly used to speed up computations.
   * Default value is false
   */
  useWebAssembly?: boolean;
}

const defaultRequest: BuildRequest = {
  bitBucketSize: 32,
  autoResize: true,
  lowestDiscernibleValue: 1,
  highestTrackableValue: 2,
  numberOfSignificantValueDigits: 3,
  useWebAssembly: false,
};

const build = (request = defaultRequest): Histogram => {
  const parameters = Object.assign({}, defaultRequest, request);
  if (request.useWebAssembly && webAssemblyAvailable) {
    if (!webAssemblyReady()) {
      throw new Error("WebAssembly is not ready yet!");
    }
    return WasmHistogram.build(parameters);
  }

  const histogramConstr = constructorFromBucketSize(
    parameters.bitBucketSize as BitBucketSize
  );

  const histogram = new histogramConstr(
    parameters.lowestDiscernibleValue as number,
    parameters.highestTrackableValue as number,
    parameters.numberOfSignificantValueDigits as number
  );
  histogram.autoResize = parameters.autoResize as boolean;
  return histogram;
};

export {
  initWebAssembly,
  Int8Histogram,
  Int16Histogram,
  Int32Histogram,
  Float64Histogram,
  PackedHistogram,
  AbstractHistogram,
  Histogram,
  HistogramLogReader,
  listTags,
  BuildRequest,
  defaultRequest,
  build,
  ByteBuffer,
  decodeFromCompressedBase64,
  encodeIntoCompressedBase64,
  HistogramLogWriter,
  Recorder,
  WasmHistogram,
};
