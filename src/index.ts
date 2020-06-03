/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import ByteBuffer from "./ByteBuffer";
import Histogram, { BuildRequest as HistogramBuildRequest } from "./Histogram";
import Int8Histogram from "./Int8Histogram";
import Int16Histogram from "./Int16Histogram";
import Int32Histogram from "./Int32Histogram";
import Float64Histogram from "./Float64Histogram";
import PackedHistogram from "./PackedHistogram";
import AbstractHistogram, { HistogramConstructor } from "./AbstractHistogram";
import HistogramLogReader, { listTags } from "./HistogramLogReader";
import HistogramLogWriter from "./HistogramLogWriter";
import {
  decodeFromCompressedBase64,
  encodeIntoCompressedBase64,
} from "./encoding";
import Recorder from "./Recorder";
import {
  WasmHistogram,
  webAssemblyAvailable,
  initWebAssembly,
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
  let histogramConstr: HistogramConstructor;
  switch (parameters.bitBucketSize) {
    case 8:
      histogramConstr = Int8Histogram;
      break;
    case 16:
      histogramConstr = Int16Histogram;
      break;
    case 32:
      histogramConstr = Int32Histogram;
      break;
    case "packed":
      histogramConstr = PackedHistogram;
      break;
    default:
      histogramConstr = Float64Histogram;
  }

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
