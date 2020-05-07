import b from "benny";
import { build, AbstractHistogram } from "../index";
import {
  encodeIntoBase64String,
  decodeFromCompressedBase64
} from "../encoding";

const randomInteger = (max: number = Number.MAX_SAFE_INTEGER) =>
  Math.floor(Math.random() * max);
const options = { initCount: 1000 };

b.suite(
  "Histogram decoding",
  b.add(
    "Int32Histogram",
    () => {
      const histogram = build({ bitBucketSize: 32 });
      for (let index = 0; index < 1024; index++) {
        histogram.recordValueWithCount(randomInteger(), randomInteger(100));
      }
      const b64 = encodeIntoBase64String(histogram as AbstractHistogram);
      return () => {
        decodeFromCompressedBase64(b64, 32, false).destroy();
      };
    },
    options
  ),

  b.add(
    "WASM 32B Histogram",
    () => {
      const histogram = build({ bitBucketSize: 32 });
      for (let index = 0; index < 1024; index++) {
        histogram.recordValue(randomInteger());
      }
      const b64 = encodeIntoBase64String(histogram as AbstractHistogram);
      return () => {
        decodeFromCompressedBase64(b64, 32, true).destroy();
      };
    },
    options
  ),

  b.complete(),
  b.save({ file: "decoding", format: "chart.html" })
);
