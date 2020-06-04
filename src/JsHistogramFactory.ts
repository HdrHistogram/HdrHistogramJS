import { BitBucketSize } from "./Histogram";
import PackedHistogram from "./PackedHistogram";
import Int8Histogram from "./Int8Histogram";
import Int16Histogram from "./Int16Histogram";
import Int32Histogram from "./Int32Histogram";
import Float64Histogram from "./Float64Histogram";
import AbstractHistogram from "./JsHistogram";

export interface AbstractHistogramConstructor {
  new (
    lowestDiscernibleValue: number,
    highestTrackableValue: number,
    numberOfSignificantValueDigits: number
  ): AbstractHistogram;
}

export function constructorFromBucketSize(
  bitBucketSize: BitBucketSize
): AbstractHistogramConstructor {
  switch (bitBucketSize) {
    case "packed":
      return PackedHistogram;
    case 8:
      return Int8Histogram;
    case 16:
      return Int16Histogram;
    case 32:
      return Int32Histogram;
    case 64:
      return Float64Histogram;
    default:
      throw new Error("Incorrect parameter bitBucketSize");
  }
}
